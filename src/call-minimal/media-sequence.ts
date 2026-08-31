export interface CallAudioSequenceDeps<TPublication> {
  enableMicrophone: () => Promise<TPublication>
  startAudio: () => Promise<void>
}

export async function enableCallAudio<TPublication>(
  deps: CallAudioSequenceDeps<TPublication>,
): Promise<TPublication> {
  const publication = await deps.enableMicrophone()
  await deps.startAudio()
  return publication
}
