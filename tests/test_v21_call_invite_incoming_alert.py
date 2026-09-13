from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class GuestCallIncomingAlertContract(unittest.TestCase):
    def test_existing_call_ui_is_reused_without_editing_native_call_engine(self):
        client = (ROOT / "call-invite-client.js").read_text(encoding="utf-8")
        self.assertIn("installCallEngineAdapter", client)
        self.assertIn("nativeCallEngine", client)
        self.assertIn("externalCallAdapter", client)
        self.assertIn("receiveIncoming", client)
        self.assertIn("acceptCurrent", client)
        self.assertIn("rejectCurrent", client)
        self.assertIn("stopCurrent", client)

    def test_admin_client_globally_watches_joined_invites(self):
        client = (ROOT / "call-invite-client.js").read_text(encoding="utf-8")
        self.assertIn("call-invite-incoming", client)
        self.assertIn("guest_joined_at", client)
        self.assertIn("focusIncomingInvite", client)
        self.assertIn("reconcileIncomingInvites", client)
        self.assertIn("admin_joined_at", client)
        self.assertIn("answered-elsewhere", client)

    def test_call_invite_push_reuses_existing_admin_push_pipeline(self):
        migration = ROOT / "supabase/migrations/20260913_call_invite_incoming_push.sql"
        self.assertTrue(migration.exists(), "incoming-call push migration is missing")
        sql = migration.read_text(encoding="utf-8").lower()
        self.assertIn("guest_joined_at", sql)
        self.assertIn("v21_call_invite_push_outbox", sql)
        self.assertIn("v21_call_invite_push_claim", sql)
        self.assertIn("admin_push_signal", sql)

        edge = (ROOT / "supabase/functions/v21-admin-push/index.ts").read_text(encoding="utf-8")
        self.assertIn("v21_call_invite_push_claim", edge)
        self.assertIn("buildCallInviteNotificationPayload", edge)

        core = (ROOT / "supabase/functions/v21-admin-push/push-core.mjs").read_text(encoding="utf-8")
        self.assertIn("buildCallInviteNotificationPayload", core)
        self.assertIn("call_invite", core)

    def test_service_worker_treats_call_as_system_notification_not_chat_message(self):
        sw = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn("call_invite", sw)
        self.assertIn("inviteId", sw)
        self.assertIn("ADMIN_PUSH_OPEN", sw)
        self.assertIn("showNotification", sw)

        controller = (ROOT / "admin-push-controller.js").read_text(encoding="utf-8")
        self.assertIn("push_call_invite", controller)
        self.assertIn("inviteId", controller)
        self.assertIn("v21-call-invite-push-open", controller)


if __name__ == "__main__":
    unittest.main()
