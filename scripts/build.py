"""Build a static Pages app. Discover .txt recursively; no hand-written index."""
import hashlib
import json
import os
import plistlib
import re
import shutil
import uuid
from pathlib import Path
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'_site', 'node_modules', 'scripts', 'tests', 'icons', 'assets', '__pycache__'}
STATIC = ('index.html', 'style.css', 'app.js', 'core.js', 'sw.js', 'manifest.webmanifest')


def discover(root):
    prompts = []
    for path in root.rglob('*'):
        relative = path.relative_to(root)
        if any(part.startswith('.') or part in EXCLUDED for part in relative.parts):
            continue
        if path.suffix.lower() != '.txt' or not path.is_file():
            continue
        if any(parent.is_symlink() for parent in [path, *path.parents] if parent != root):
            continue
        try:
            # Keep line endings and Unicode exactly. Only strip an optional UTF-8 BOM.
            text = path.read_bytes().decode('utf-8-sig')
        except UnicodeDecodeError as error:
            raise ValueError(f'Tệp prompt phải lưu bằng UTF-8: {relative.as_posix()}') from error
        if not text.strip():
            continue
        title = re.sub(r'[_-]+', ' ', path.stem).strip() or path.stem
        category = relative.parent.as_posix() if relative.parent != Path('.') else 'Chung'
        prompts.append({'id': relative.as_posix(), 'title': title, 'category': category, 'text': text})
    prompts.sort(key=lambda item: (item['category'] != 'Chung', item['category'].casefold(), item['title'].casefold(), item['id']))
    digest = hashlib.sha256(json.dumps(prompts, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:16]
    return {'schema': 1, 'version': digest, 'prompts': prompts}


def site_url():
    repository = os.environ.get('GITHUB_REPOSITORY') or 'dammeiosvn/Promtp-AI'
    owner, name = repository.split('/', 1)
    default = f'https://{owner.lower()}.github.io/' + ('' if name.lower() == f'{owner.lower()}.github.io' else quote(name, safe='') + '/')
    base = (os.environ.get('PAGES_BASE_URL') or default).rstrip('/') + '/'
    parsed = urlparse(base)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('PAGES_BASE_URL phải là URL HTTPS của trang, không có query/fragment.')
    return base


def profile(base_url, icon):
    identity = 'vn.sentechtips.promptai.' + hashlib.sha256(base_url.encode()).hexdigest()[:12]
    payload = {
        'PayloadType': 'com.apple.webClip.managed', 'PayloadVersion': 1,
        'PayloadIdentifier': identity + '.webclip',
        'PayloadUUID': str(uuid.uuid5(uuid.NAMESPACE_URL, base_url + '#webclip')).upper(),
        'PayloadDisplayName': 'Prompt AI', 'Label': 'Prompt AI', 'URL': base_url,
        'Icon': icon, 'FullScreen': True, 'IsRemovable': True, 'Precomposed': True,
    }
    return plistlib.dumps({
        'PayloadType': 'Configuration', 'PayloadVersion': 1,
        'PayloadIdentifier': identity,
        'PayloadUUID': str(uuid.uuid5(uuid.NAMESPACE_URL, base_url + '#profile')).upper(),
        'PayloadDisplayName': 'Prompt AI', 'PayloadOrganization': 'Sentechtipsvn',
        'PayloadDescription': 'Thêm kho prompt vào màn hình chính và gửi văn bản sang phím tắt Prompt AI.',
        'PayloadContent': [payload],
    }, sort_keys=False)


def build(root=ROOT):
    output = root / '_site'
    catalog = discover(root)
    encoded = (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    profile_bytes = profile(site_url(), (root / 'icons/apple-touch-icon.png').read_bytes())
    hasher = hashlib.sha256(encoded + profile_bytes)
    for filename in STATIC:
        hasher.update((root / filename).read_bytes())
    for icon in sorted((root / 'icons').glob('*.png')):
        hasher.update(icon.read_bytes())
    version = hasher.hexdigest()[:16]
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    for filename in STATIC:
        source = (root / filename).read_bytes()
        if filename == 'sw.js':
            source = source.replace(b'__BUILD_VERSION__', version.encode('ascii'))
        (output / filename).write_bytes(source)
    shutil.copytree(root / 'icons', output / 'icons')
    (output / 'prompts.json').write_bytes(encoded)
    (output / 'Prompt-AI.mobileconfig').write_bytes(profile_bytes)
    (output / '.nojekyll').touch()
    print(f'Built {len(catalog["prompts"])} prompts / version {version} → {output}')
    return output


if __name__ == '__main__':
    build()
