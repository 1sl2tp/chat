# TAPHOA CHAT — NO-WAIT / NO-SPAM WORKFLOW

- Một incident → một owner → một patch → một deploy.
- Workflow/job đang chạy → không tạo job thứ hai chỉ để “thử”.
- Cùng một cơ chế fail 2 lần → dừng retry, đọc log nhỏ nhất, đổi đúng owner hoặc rollback.
- 429/quota/rate-limit → giảm/batch/coalesce; không tăng polling.
- Realtime lỗi → không chữa bằng interval message polling.
- Một conversation lỗi → probe đúng account/conversation/RPC; không scan toàn DB.
- Test/deploy đang chạy thì chuẩn bị rollback, production probe và docs; không poll workflow liên tục.
- Hard limit là constraint thiết kế, không phải lý do fan-out request.
- Chỉ nói “xong” sau TEST PASS → DEPLOYED → PROD VERIFIED → CURRENT_WORK UPDATED.
