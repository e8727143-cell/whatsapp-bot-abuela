import sys
import os
from faster_whisper import WhisperModel

if len(sys.argv) < 2:
    print("")
    sys.exit(0)

audio_path = sys.argv[1]
if not os.path.exists(audio_path):
    print("")
    sys.exit(0)

try:
    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio_path, language="es")
    texto = " ".join([seg.text for seg in segments]).strip()
    print(texto)
except Exception as e:
    sys.stderr.write(str(e))
    print("")
