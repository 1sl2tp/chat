# BANK-ACCOUNT-ROOT-01h — RULE cha đọc bill (đề xuất nghiệm thu)
Baseline: PR #442 / 9b85fc9c9df2f949d88789436e6ba9dce2339ca8. PR #441 và #442 đã đạt CI trên commit riêng. Tài liệu này không thay đổi runtime, SQL hay quyền thu tiền.

## 1. Phân tầng quyền sở hữu
- ImageIdentity: kiểm MIME thật/alias, kích thước, SHA-256, quyền chủ ảnh và vòng đời. Không lấy ảnh khác hội thoại. Ảnh gốc không thay đổi. EXIF/crop chỉ là dữ liệu hỗ trợ; không suy ra số từ vùng ảnh.
- VisionTransport: một đường gọi Gemini, parse JSON và kiểm tra trạng thái kết thúc. Không gửi STK đích, giờ ngân hàng hoặc kết quả kỳ vọng vào prompt đọc độc lập.
- EvidenceReader: prompt bố cục ngân hàng, xác định vai trò, 10 trường, phân loại thiếu/mờ/xung đột. Tọa độ chuẩn hóa y/x trên ảnh gốc, cache theo bill+SHA-256+version.
- EvidenceValidator: hàm thuần kiểm tra bằng chứng hai chiều, ngày giờ và nội dung; không tự bù số; dùng chung cho OCR/đọc lại/benchmark nhưng giữ riêng điều kiện đủ tư cách từng luồng.
- EvidenceProjection: hiển thị trường gốc và trường xác minh, không biến giờ Agribank thành giờ in trên ảnh. Trạng thái thiếu giờ phải còn rõ.
- Reconciliation: kết quả OCR không phải quyền ghi thu. Giữ nguyên các RPC tài chính, đối soát Agribank, chống trùng, kiểm quyền và quy tắc thiếu giờ đã duyệt. Không mở rộng điều kiện AUTO trong RULE này.

## 2. Hợp đồng dữ liệu — proposed, chưa đổi schema
Tách 4 lớp: (A) nguồn ảnh/sha/receipt/reader version; (B) bản chép lần đầu theo whitelist, bao gồm memo_lines nguyên văn, ngày giờ in, STK nhìn thấy, vai trò trường; (C) dữ liệu chuẩn hóa có phiên bản hàm và lý do; (D) bằng chứng đọc lại hoặc đối soát ngân hàng gắn SHA, phiên bản gốc, nguồn, thời điểm xác minh. Cache chỉ tọa độ; không thay thế B hoặc D. Không lưu prompt/raw provider envelope, khóa bí mật, suy luận mô hình, số dư không liên quan. Bất kỳ thay đổi bằng chứng phải giữ provenance; không ghi đè lịch sử bằng chứng. Không áp schema vào production khi chưa có migration tương thích, ACL và test.
Hiện tại index.ts dùng parsed=sanitizeJournalRecipientFields(normalizeVisionMemo(vision.parsed)), rồi parsed=recovered trước khi lưu raw_read. memo_raw và memo_lines được lưu nhưng không có snapshot đủ các trường lần đầu độc lập. Các nhánh hiệu chỉnh ngày/tái kiểm tra/audited read cũng cập nhật raw_read. Cần audit lineage, không kết luận mọi trường gốc đã mất. Không sửa dữ liệu cũ chỉ để đạt RULE.

## 3. Ngân sách và điều phối
Giới hạn hiện có: main OCR tối đa 3 request/30s, focused chỉ khi còn >=6s và request count <3; locator tối đa 1/12s; focused account tối đa locator 1 + read 1, 30s phần AI nếu cần locator, nếu không 15s; small_text 1/15s; benchmark <=2/ảnh, outer handler 45s; diagnostic 0 AI; cache 750ms mỗi RPC (candidate), SQL lock timeout 500ms. Focus queue <=2 attempts cho một receipt/raw_hash/field, lease 90s; giới hạn riêng không phải giới hạn toàn đời bill. Main scan có cơ chế retry riêng. Không đưa giới hạn cộng dồn mới vào runtime trước khi duyệt.
Rule mới: API cha quản lý deadline/remaining, count theo lần gửi thực tế (kể lỗi), trạng thái không đủ ngân sách và nguyên nhân retry. Không tăng số request hoặc deadline chỉ để định vị. Dùng chung permit cho benchmark/focused; hiện benchmark claim kiểm cả hai queue nhưng focused claim chỉ kiểm focused, dù cùng advisory lock 75638129. Chỉ giữ một job AI bổ sung đang chạy; thêm race test hai chiều và lease expiry. Không giữ permit khi gọi UI/ghi thu; không làm nghẽn OCR mới. Phải xác định riêng chính sách ưu tiên main vs bổ sung trước khi triển khai.
Không coi timeout client đồng nghĩa server chắc chắn đã hủy; kiểm lease tại server, atomic finish một lần, không tự retry persist.

## 4. Các điểm cần hợp nhất tiếp
H1: điều phối đối xứng benchmark/focused + hai chiều claim concurrency.
H2: cùng chuẩn MIME image/jpg -> image/jpeg (index.ts đang dùng media.mime_type trực tiếp cho OCR đầu và small text). Không nhận ảnh chỉ dựa tên MIME.
H3: dùng chung clock-only eligibility/validator cho hai luồng, nhưng inline small text hiện có thể đưa dữ liệu dẫn xuất vào đối soát; không nối bằng chứng display-only sang writer. Kiểm riêng trường hợp ngày không giờ, giờ điện thoại, xung đột, Agribank xác minh.
H4: normalizeVisionMemo (16 dòng, giữ memo_raw/lines, kiểm sự đồng thuận) và recoverSmallText (8 dòng, nối khoảng trắng) cần hợp đồng chung; không làm rộng quy tắc khớp nội dung tài chính. Giữ nguyên bản chép trước và sau. Kiểm giới hạn, xung đột, xuống dòng, tab, không tự chèn tên khách.
H5: một bộ ngân sách/payload/trace chuẩn, giữ retry policy hiện tại (502/503/504, malformed response, cap); không bắt 400/401/403/404/429 để retry mù. Không ghi raw text vào log.
H6: phân lớp evidence theo mục 2, kiểm hash stale, quyền, nguyên văn và version. Lưu ý queue hiện khóa receipt/raw_hash/field; raw_read thay đổi có thể tạo version công việc mới; cần kiểm soát phiên bản bằng chứng và giới hạn vòng đời trước AUTO, không tự reset attempts.

## 5. Ma trận nghiệm thu
- A: ảnh trùng đã xác định -> 0 AI; ảnh thay đổi SHA -> cache miss; sai quyền/hash/lease -> không đọc hoặc ghi cache.
- B: OCR hoàn tất/thiếu số/mờ/masked/sai vai trò, số lặp; hai chiều không đồng thuận -> review, không tự bù. Ảnh cắt không hợp lệ -> dùng ảnh gốc trong budget.
- C: giờ có/không, ngày mâu thuẫn, đồng hồ điện thoại, giờ Agribank độc lập; luôn giữ đúng nguồn.
- D: nội dung nhiều dòng/chuỗi không khớp, preserve literal; parser STOP/non-STOP/thought/malformed, quota/cap, hủy.
- E: race benchmark-first và focused-first, hết lease, restart, cache unavailable, 1/2/3 request, không đổi ledger và raw receipt trong display-only job.
- F: 14 ảnh gốc cố định, cold/warm, log số request và reason code, thời gian, đúng STK, kiểm 0v. Baseline 14 receipts / 14 ledger links / 72.571.000 VND. Không dùng 14 ảnh giả lập làm chứng cứ đọc thật.
- G: không thay đổi 4 vùng API bàn phím, không phát hành Edge/SQL khi chưa có quyền và nghiệm thu.

## 6. Trạng thái
RULE đề xuất; chưa sửa runtime, chưa chạy CI mới, chưa merge, không bật AUTO/cron. H1-H6 là backlog có tiêu chí nghiệm thu, không phải lỗi production đã tái hiện. PR #442 vẫn là ứng viên đã đạt CI nhưng cần nghiệm thu ảnh thật. Không thay đổi sổ thu.
