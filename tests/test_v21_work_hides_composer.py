from pathlib import Path
import unittest
SHELL=Path(__file__).resolve().parents[1].joinpath("shell.js").read_text("utf-8")
class WorkComposerContract(unittest.TestCase):
    def test_work_route_hard_hides_composer_and_reclaims_height(self):
        self.assertIn("const hideWork=!desktopWorkspace&&route==='work';", SHELL)
        self.assertIn("composer.style.display=hideWork?'none':'';", SHELL)
        self.assertIn("workView.style.height=hideWork?'calc(100svh - var(--header-height,72px))':'';", SHELL)
if __name__=="__main__": unittest.main()
