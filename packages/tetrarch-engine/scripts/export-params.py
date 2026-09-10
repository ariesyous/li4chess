"""Build-time only: freeze pinned upstream geometry, not a runtime dependency."""
import ctypes
import json
import pathlib
import sys

if sys.byteorder != 'little':
    raise RuntimeError('Parameter export requires a little-endian build host')

upstream = pathlib.Path(sys.argv[1]).resolve()
out = pathlib.Path(sys.argv[2]).resolve()
sys.path.insert(0, str(upstream))
from tetrarch import core, board, nnue

out.mkdir(parents=True, exist_ok=True)
(out / 'params.bin').write_bytes(bytes(core.build_params()))
net = nnue.Net.load(str(upstream / 'nets/net-ffa1.nnue'))
fixtures = []
for setup in ('classic', 'modern', 'by', 'byg', 'rg'):
    b = board.start_board(setup, board.MODE_FFA)
    fixtures.append(dict(setup=setup, squares=list(b.sq),
                         evaluation=net.evaluate(b),
                         paramsSize=ctypes.sizeof(core.TtParams)))
(out / 'reference.json').write_text(json.dumps(fixtures, indent=2) + '\n')
