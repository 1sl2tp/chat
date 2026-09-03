import type { OverlayManager } from '../app/overlay-manager.js';
import { icon } from '../ui/icons.js';

export interface ComposerPayload {
  text: string;
  images: string[];
  imageFiles?: File[];
  fileName?: string;
  fileUrl?: string;
  file?: File;
  audioFile?: File;
  audioDuration?: number;
  replyTo?: string;
  replyToId?: string;
}

export class Composer {
  readonly root: HTMLElement;
  #input: HTMLTextAreaElement;
  #imageInput: HTMLInputElement;
  #cameraInput: HTMLInputElement;
  #fileInput: HTMLInputElement;
  #preview: HTMLElement;
  #filePreview: HTMLElement;
  #reply: HTMLElement;
  #attachMenu: HTMLElement;
  #pendingImages: Array<{ file: File; url: string }> = [];
  #pendingFile: { name: string; url: string; file: File } | null = null;
  #replyText = '';
  #replyId: string | undefined;
  #recordSeconds = 0;
  #recordTimer: number | null = null;
  #recordPaused = false;
  #recorder: MediaRecorder | null = null;
  #recordStream: MediaStream | null = null;
  #recordChunks: Blob[] = [];
  #outside = (event: PointerEvent): void => {
    const target = event.target as Node | null;
    if (target && this.root.contains(target)) return;
    this.setAttachMenu(false);
  };

  constructor(private readonly overlays: OverlayManager, private readonly onSend: (payload: ComposerPayload) => void, private readonly onFocusBottom: () => void) {
    this.root = document.createElement('section');
    this.root.className = 'composer-owner';
    this.root.innerHTML = `
      <div class="composer-reply" data-reply hidden></div>
      <div class="composer-preview" data-preview hidden></div>
      <div class="composer-file-preview" data-file-preview hidden></div>
      <div class="composer-attach-menu" data-attach-menu hidden>
        <button type="button" data-pick-images>${icon('image')}<span>Ảnh</span></button>
        <button type="button" data-camera>${icon('camera')}<span>Camera</span></button>
        <button type="button" data-pick-file>${icon('file')}<span>Tệp</span></button>
      </div>
      <div class="composer-normal" data-normal>
        <button class="icon-button" type="button" data-attach aria-label="Đính kèm">${icon('plus')}</button>
        <textarea rows="1" data-input placeholder="Nhập tin nhắn..."></textarea>
        <button class="icon-button" type="button" data-mic aria-label="Ghi âm">${icon('mic')}</button>
        <button class="send-button" type="button" data-send aria-label="Gửi">${icon('send')}</button>
      </div>
      <div class="composer-record" data-record hidden>
        <button class="record-delete" type="button" data-record-delete>${icon('trash')}<span>Xóa</span></button>
        <span class="record-time"><i></i><b data-record-time>00:00</b></span>
        <span class="record-label">Đang ghi âm...</span>
        <button class="record-pause" type="button" data-record-pause>${icon('pause')}<span>Tạm dừng</span></button>
        <button class="send-button" type="button" data-record-send>${icon('send')}</button>
      </div>
      <input data-image-input type="file" accept="image/*" multiple hidden />
      <input data-camera-input type="file" accept="image/*" capture="environment" hidden />
      <input data-file-input type="file" hidden />`;
    this.#input = this.root.querySelector<HTMLTextAreaElement>('[data-input]')!;
    this.#imageInput = this.root.querySelector<HTMLInputElement>('[data-image-input]')!;
    this.#cameraInput = this.root.querySelector<HTMLInputElement>('[data-camera-input]')!;
    this.#fileInput = this.root.querySelector<HTMLInputElement>('[data-file-input]')!;
    this.#preview = this.root.querySelector<HTMLElement>('[data-preview]')!;
    this.#filePreview = this.root.querySelector<HTMLElement>('[data-file-preview]')!;
    this.#reply = this.root.querySelector<HTMLElement>('[data-reply]')!;
    this.#attachMenu = this.root.querySelector<HTMLElement>('[data-attach-menu]')!;
    this.bind();
    document.addEventListener('pointerdown', this.#outside, true);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.#outside, true);
    void this.stopRecording(true);
  }

  setReply(text: string, messageId?: string): void {
    this.#replyText = text;
    this.#replyId = messageId;
    this.#reply.hidden = false;
    this.#reply.innerHTML = `<span>${escapeHtml(text)}</span><button class="icon-button micro" type="button" aria-label="Bỏ trả lời">${icon('close')}</button>`;
    this.#reply.querySelector('button')?.addEventListener('click', () => this.clearReply());
    this.#input.focus();
  }

  clearReply(): void {
    this.#replyText = '';
    this.#replyId = undefined;
    this.#reply.hidden = true;
    this.#reply.replaceChildren();
  }

  focus(): void { this.#input.focus(); }

  private bind(): void {
    this.root.querySelector<HTMLButtonElement>('[data-attach]')?.addEventListener('click', () => this.setAttachMenu(this.#attachMenu.hidden));
    this.root.querySelector<HTMLButtonElement>('[data-pick-images]')?.addEventListener('click', () => this.#imageInput.click());
    this.root.querySelector<HTMLButtonElement>('[data-camera]')?.addEventListener('click', () => this.#cameraInput.click());
    this.root.querySelector<HTMLButtonElement>('[data-pick-file]')?.addEventListener('click', () => this.#fileInput.click());

    this.#imageInput.addEventListener('change', () => this.takeImages(this.#imageInput));
    this.#cameraInput.addEventListener('change', () => this.takeImages(this.#cameraInput));
    this.#fileInput.addEventListener('change', () => {
      const file = this.#fileInput.files?.[0];
      this.#fileInput.value = '';
      this.setAttachMenu(false);
      if (!file) return;
      this.clearPendingImages();
      this.#pendingFile = { name: file.name, url: URL.createObjectURL(file), file };
      this.paintFilePreview();
    });

    this.root.querySelector<HTMLButtonElement>('[data-send]')?.addEventListener('click', () => this.sendCurrent());
    this.root.querySelector<HTMLButtonElement>('[data-mic]')?.addEventListener('click', () => { void this.startRecording(); });
    this.root.querySelector<HTMLButtonElement>('[data-record-delete]')?.addEventListener('click', () => {
      this.overlays.openConfirm({ title: 'Xóa ghi âm?', message: 'Bản ghi đang soạn sẽ bị bỏ.', confirmLabel: 'Xóa', cancelLabel: 'Hủy', onConfirm: () => { void this.stopRecording(true); } });
    });
    this.root.querySelector<HTMLButtonElement>('[data-record-pause]')?.addEventListener('click', () => this.togglePause());
    this.root.querySelector<HTMLButtonElement>('[data-record-send]')?.addEventListener('click', async () => {
      const duration = Math.max(1, this.#recordSeconds);
      const file = await this.stopRecording(false);
      if (!file) return;
      this.onSend({ text: '', images: [], audioDuration: duration, audioFile: file, replyTo: this.#replyText || undefined, replyToId: this.#replyId });
      this.clearReply();
    });
    this.#input.addEventListener('focus', () => { this.setAttachMenu(false); this.onFocusBottom(); });
    this.#input.addEventListener('input', () => {
      this.#input.style.height = 'auto';
      this.#input.style.height = `${Math.min(112, this.#input.scrollHeight)}px`;
    });
    this.#input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.sendCurrent();
      }
    });
  }

  private setAttachMenu(open: boolean): void {
    this.#attachMenu.hidden = !open;
  }

  private takeImages(input: HTMLInputElement): void {
    const files = [...(input.files ?? [])].filter((file) => file.type.startsWith('image/'));
    input.value = '';
    this.setAttachMenu(false);
    if (!files.length) return;
    this.clearPendingFile();
    for (const file of files) this.#pendingImages.push({ file, url: URL.createObjectURL(file) });
    this.paintPreview();
    this.#input.placeholder = 'Thêm nội dung cho ảnh...';
  }

  private sendCurrent(): void {
    const text = this.#input.value.trim();
    if (!text && !this.#pendingImages.length && !this.#pendingFile) return;
    this.onSend({
      text,
      images: this.#pendingImages.map((item) => item.url),
      imageFiles: this.#pendingImages.map((item) => item.file),
      fileName: this.#pendingFile?.name,
      fileUrl: this.#pendingFile?.url,
      file: this.#pendingFile?.file,
      replyTo: this.#replyText || undefined,
      replyToId: this.#replyId
    });
    this.#input.value = '';
    this.#input.style.height = 'auto';
    this.#pendingImages = [];
    this.#pendingFile = null;
    this.#input.placeholder = 'Nhập tin nhắn...';
    this.paintPreview();
    this.paintFilePreview();
    this.clearReply();
  }

  private paintPreview(): void {
    this.#preview.hidden = this.#pendingImages.length === 0;
    this.#preview.replaceChildren(...this.#pendingImages.map((pending, index) => {
      const item = document.createElement('div');
      item.className = 'composer-preview-item';
      item.innerHTML = `<img src="${escapeAttr(pending.url)}" alt="Ảnh ${index + 1}" /><button class="icon-button micro" type="button" aria-label="Bỏ ảnh">${icon('close')}</button>`;
      item.querySelector('button')?.addEventListener('click', () => {
        this.overlays.openConfirm({ title: 'Bỏ ảnh?', message: 'Ảnh sẽ bị bỏ khỏi nội dung đang soạn.', confirmLabel: 'Xóa', cancelLabel: 'Hủy', onConfirm: () => {
          const [removed] = this.#pendingImages.splice(index, 1);
          if (removed?.url.startsWith('blob:')) URL.revokeObjectURL(removed.url);
          this.paintPreview();
          if (!this.#pendingImages.length) this.#input.placeholder = 'Nhập tin nhắn...';
        }});
      });
      return item;
    }));
  }

  private paintFilePreview(): void {
    this.#filePreview.hidden = !this.#pendingFile;
    this.#filePreview.replaceChildren();
    if (!this.#pendingFile) return;
    const chip = document.createElement('div');
    chip.className = 'composer-file-chip';
    chip.innerHTML = `${icon('file')}<span>${escapeHtml(this.#pendingFile.name)}</span><button class="icon-button micro" type="button" aria-label="Bỏ tệp">${icon('close')}</button>`;
    chip.querySelector('button')?.addEventListener('click', () => {
      this.overlays.openConfirm({ title: 'Bỏ tệp?', message: 'Tệp sẽ bị bỏ khỏi nội dung đang soạn.', confirmLabel: 'Xóa', cancelLabel: 'Hủy', onConfirm: () => { this.clearPendingFile(); this.paintFilePreview(); } });
    });
    this.#filePreview.append(chip);
  }

  private clearPendingImages(): void {
    for (const item of this.#pendingImages) if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
    this.#pendingImages = [];
    this.paintPreview();
  }

  private clearPendingFile(): void {
    if (this.#pendingFile?.url.startsWith('blob:')) URL.revokeObjectURL(this.#pendingFile.url);
    this.#pendingFile = null;
    this.paintFilePreview();
  }

  private async startRecording(): Promise<void> {
    this.setAttachMenu(false);
    if (this.#recorder && this.#recorder.state !== 'inactive') return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.showRecordingError('Thiết bị hoặc trình duyệt hiện tại không hỗ trợ ghi âm.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.#recordStream = stream;
      this.#recorder = recorder;
      this.#recordChunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.#recordChunks.push(event.data);
      };
      recorder.start(250);

      this.#recordSeconds = 0;
      this.#recordPaused = false;
      this.root.querySelector<HTMLElement>('[data-normal]')!.hidden = true;
      this.root.querySelector<HTMLElement>('[data-record]')!.hidden = false;
      this.paintRecord();
      if (this.#recordTimer !== null) window.clearInterval(this.#recordTimer);
      this.#recordTimer = window.setInterval(() => {
        if (this.#recordPaused) return;
        this.#recordSeconds += 1;
        this.paintRecord();
      }, 1000);
    } catch {
      this.releaseRecordingStream();
      this.showRecordingError('Không thể truy cập micro. Hãy kiểm tra quyền micro rồi thử lại.');
    }
  }

  private togglePause(): void {
    const recorder = this.#recorder;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      this.#recordPaused = true;
    } else if (recorder.state === 'paused') {
      recorder.resume();
      this.#recordPaused = false;
    } else {
      return;
    }
    this.paintRecord();
  }

  private paintRecord(): void {
    const time = this.root.querySelector<HTMLElement>('[data-record-time]')!;
    time.textContent = `${String(Math.floor(this.#recordSeconds / 60)).padStart(2, '0')}:${String(this.#recordSeconds % 60).padStart(2, '0')}`;
    const pause = this.root.querySelector<HTMLButtonElement>('[data-record-pause]')!;
    pause.innerHTML = `${icon(this.#recordPaused ? 'play' : 'pause')}<span>${this.#recordPaused ? 'Tiếp tục' : 'Tạm dừng'}</span>`;
    this.root.classList.toggle('record-paused', this.#recordPaused);
  }

  private stopRecording(discard: boolean): Promise<File | null> {
    if (this.#recordTimer !== null) window.clearInterval(this.#recordTimer);
    this.#recordTimer = null;
    this.#recordPaused = false;
    this.root.classList.remove('record-paused');
    this.root.querySelector<HTMLElement>('[data-record]')!.hidden = true;
    this.root.querySelector<HTMLElement>('[data-normal]')!.hidden = false;

    const recorder = this.#recorder;
    if (!recorder) {
      this.#recordSeconds = 0;
      this.releaseRecordingStream();
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const finish = (): void => {
        const mimeType = recorder.mimeType || this.#recordChunks[0]?.type || 'audio/webm';
        const chunks = this.#recordChunks;
        this.#recorder = null;
        this.#recordChunks = [];
        this.releaseRecordingStream();
        this.#recordSeconds = 0;
        if (discard || !chunks.length) {
          resolve(null);
          return;
        }
        const extension = audioExtension(mimeType);
        const file = new File(chunks, `ghi-am-${Date.now()}.${extension}`, { type: mimeType });
        resolve(file);
      };

      recorder.onstop = finish;
      if (recorder.state === 'inactive') finish();
      else recorder.stop();
    });
  }

  private releaseRecordingStream(): void {
    this.#recordStream?.getTracks().forEach((track) => track.stop());
    this.#recordStream = null;
  }

  private showRecordingError(message: string): void {
    const content = document.createElement('div');
    content.className = 'empty-state';
    content.textContent = message;
    this.overlays.openSheet({ title: 'Ghi âm', content });
  }
}

function preferredAudioMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char)); }
function escapeAttr(value: string): string { return escapeHtml(value).replace(/`/g, '&#96;'); }
