"""Controlla un backup senza estrarlo o sovrascrivere dati."""
import hashlib,json,sys,zipfile
from pathlib import Path

def verify(folder):
 folder=Path(folder);manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'));archive=folder/'snapshot.zip'
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=manifest['archive_sha256']:raise ValueError('Hash archivio non corrispondente.')
 with zipfile.ZipFile(archive) as z:
  if set(z.namelist())!=set(manifest['files']):raise ValueError('Elenco file non corrispondente.')
  for name,digest in manifest['files'].items():
   if hashlib.sha256(z.read(name)).hexdigest()!=digest:raise ValueError('File alterato: '+name)
 print('Snapshot integro:',len(manifest['files']),'file verificati. Nessun dato ripristinato.')
if __name__=='__main__':verify(sys.argv[1])
