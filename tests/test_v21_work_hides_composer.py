from pathlib import Path
import unittest
SHELL=Path(__file__).resolve().parents[1].joinpath("shell.js").read_text("utf-8")
class WorkComposerContract(unittest.TestCase):
    def test_work_route_hides_composer_and_chat_restores_it(self):
        self.assertIn("const composer=document.getElementById(\'thread-bottom-container\');", SHELL)
        self.assertIn("composer.hidden=!desktopWorkspace&&route===\'work\';", SHELL)
if __name__=="__main__": unittest.main()
