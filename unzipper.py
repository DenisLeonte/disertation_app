import zipfile
from pathlib import Path

for d in ['data/era5/single_level', 'data/era5/pressure_level']:
    for f in Path(d).glob('*.nc'):
        # Check magic bytes with a closed handle before doing anything else
        with open(f, 'rb') as fh:
            magic = fh.read(2)
        if magic != b'PK':
            continue

        print(f'Unzipping {f.name}')
        with zipfile.ZipFile(f) as zf:
            nc = [n for n in zf.namelist() if n.endswith('.nc')][0]
            zf.extract(nc, f.parent)

        extracted = f.parent / nc
        f.unlink()              # delete the zip-disguised .nc first
        extracted.rename(f)     # then rename extracted file into place

print('Done')
