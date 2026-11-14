"""Verified HTTPS downloads, with an atomic local raw cache."""
import hashlib
import time
from pathlib import Path


def fetch(url, raw_dir, offline=False, force=False, byte_range=None):
    path = Path(raw_dir) / hashlib.sha256((url + str(byte_range)).encode()).hexdigest()
    if path.exists() and (offline or not force):
        return path
    if offline:
        raise FileNotFoundError(f'Offline cache miss: {url}')
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            import subprocess
            temporary = path.with_suffix('.part')
            headers = path.with_suffix('.headers')
            command = ['curl.exe' if __import__('os').name == 'nt' else 'curl', '--fail', '--location', '--max-time', '1200', '--retry', '2', '-sS', '-A', 'claudemaxxing-etl/0.1', '-D', str(headers), '-o', str(temporary)]
            if byte_range is not None:
                command += ['--range', f'{byte_range[0]}-{byte_range[1]}']
            subprocess.run(command+[url], check=True)
            payload = temporary.read_bytes()
            if byte_range is not None:
                expected = f'bytes {byte_range[0]}-{byte_range[1]}/'
                if expected not in headers.read_text() or len(payload) != byte_range[1]-byte_range[0]+1:
                    raise ValueError('Server did not return requested byte range')
            headers.unlink()
            temporary = path.with_suffix('.part')
            temporary.write_bytes(payload)
            temporary.replace(path)
            return path
        except OSError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
