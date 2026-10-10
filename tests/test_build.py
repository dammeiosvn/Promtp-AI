import importlib.util
import os
import plistlib
import tempfile
import json
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('build', Path(__file__).resolve().parents[1] / 'scripts/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class DiscoveryTests(unittest.TestCase):
    def test_nested_unicode_folders_root_files_and_exact_line_endings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nested = root / 'prompt tạo ảnh' / 'Khmer & Java'
            nested.mkdir(parents=True)
            text = 'Giữ nét gốc 👰 & 100%\r\nKhông thừa ngón\n'
            (nested / 'Ảnh_cưới-đẹp.TXT').write_bytes(text.encode('utf-8'))
            (root / 'Dịch.txt').write_text('dịch', encoding='utf-8')
            (root / 'empty.txt').write_text(' \n', encoding='utf-8')
            (root / '.hidden').mkdir()
            (root / '.hidden/secret.txt').write_text('skip')
            (root / '_site').mkdir()
            (root / '_site/duplicate.txt').write_text('skip')
            (root / 'alias.txt').symlink_to(nested / 'Ảnh_cưới-đẹp.TXT')
            catalog = build.discover(root)
            self.assertEqual(len(catalog['prompts']), 2)
            row = catalog['prompts'][1]
            self.assertEqual(row['title'], 'Ảnh cưới đẹp')
            self.assertEqual(row['category'], 'prompt tạo ảnh/Khmer & Java')
            self.assertEqual(row['text'], text)
            self.assertEqual(catalog['version'], build.discover(root)['version'])
            (root / 'prompt mới').mkdir()
            (root / 'prompt mới/Code.txt').write_text('new', encoding='utf-8')
            self.assertEqual(len(build.discover(root)['prompts']), 3)
            self.assertNotEqual(catalog['version'], build.discover(root)['version'])

    def test_invalid_utf8_fails_with_file_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'bad.txt').write_bytes(b'\xff')
            with self.assertRaisesRegex(ValueError, 'bad.txt'):
                build.discover(root)

    def test_build_emits_small_version_file_and_updates_it_after_prompt_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in build.STATIC:
                shutil.copyfile(build.ROOT / name, root / name)
            shutil.copytree(build.ROOT / 'icons', root / 'icons')
            prompt = root / 'Mới.txt'
            prompt.write_text('nguyên văn', encoding='utf-8')
            output = build.build(root)
            catalog = json.loads((output / 'prompts.json').read_text())
            version = json.loads((output / 'version.json').read_text())
            self.assertEqual(version, {'schema': 1, 'version': catalog['version']})
            self.assertLess((output / 'version.json').stat().st_size, 100)
            prompt.unlink()
            build.build(root)
            self.assertNotEqual(json.loads((output / 'version.json').read_text())['version'], version['version'])
            self.assertEqual(json.loads((output / 'prompts.json').read_text())['prompts'], [])

    def test_profile_has_fullscreen_icon_and_correct_project_url(self):
        with patch.dict(os.environ, {'GITHUB_REPOSITORY': 'dammeiosvn/Promtp-AI', 'PAGES_BASE_URL': ''}):
            url = build.site_url()
        self.assertEqual(url, 'https://dammeiosvn.github.io/Promtp-AI/')
        payload = plistlib.loads(build.profile(url, b'PNG'))['PayloadContent'][0]
        self.assertTrue(payload['FullScreen'])
        self.assertTrue(payload['IsRemovable'])
        self.assertEqual(payload['URL'], url)
        self.assertEqual(payload['Icon'], b'PNG')
        with patch.dict(os.environ, {'PAGES_BASE_URL': 'https://prompts.example.com'}):
            self.assertEqual(build.site_url(), 'https://prompts.example.com/')

    def test_demo_images_are_copied_unchanged_and_refresh_the_webclip_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in build.STATIC:
                shutil.copyfile(build.ROOT / name, root / name)
            shutil.copytree(build.ROOT / 'icons', root / 'icons')
            (root / 'Intimate Couple.txt').write_text('original prompt', encoding='utf-8')
            (root / 'Demo').mkdir()
            image = root / 'Demo/Intimate_Couple.jpeg'
            original = b'\xff\xd8original JPEG bytes\xff\xd9'
            image.write_bytes(original)
            (root / 'Demo/README.md').write_text('naming guide')
            (root / 'Demo/linked.jpeg').symlink_to(image)
            output = build.build(root)
            self.assertEqual((output / 'Demo/Intimate_Couple.jpeg').read_bytes(), original)
            self.assertEqual([p.name for p in (output / 'Demo').iterdir()], ['Intimate_Couple.jpeg'])
            first_worker = (output / 'sw.js').read_bytes()
            first_catalog = (output / 'prompts.json').read_bytes()
            image.write_bytes(original + b'new image')
            build.build(root)
            self.assertNotEqual((output / 'sw.js').read_bytes(), first_worker)
            self.assertEqual((output / 'prompts.json').read_bytes(), first_catalog)
            image.unlink()
            build.build(root)
            self.assertFalse((output / 'Demo').exists())


if __name__ == '__main__':
    unittest.main()
