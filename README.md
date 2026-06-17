# HumFinder / MultiMatch

A humming-based song similarity detection system with a React frontend and Flask backend.

**Overview**

- **Project:** Identify songs from short humming or vocal recordings.
- **Frontend:** Vite + React application (located in `frontend/app`).
- **Backend:** Flask API server providing song database management and humming matching (located in `backend/App.py`).
- **Core idea:** Extract pitch contours from audio (using `librosa`), convert to simplified melodic contours, and compare using dynamic time-warping / signature distance to find best matches.

**Quick Links**
- File: [backend/App.py](backend/App.py)
- File: [frontend/app/package.json](frontend/app/package.json)
- File: [README.md](README.md)

**Screenshots**
- To include the screenshots you supplied, copy them into the project screenshots folder and name them `screenshot-1.png`, `screenshot-2.png`, etc. Example PowerShell commands (run from the project root):

```powershell
mkdir -Force docs\screenshots
Copy-Item "C:\Users\LENOVO\OneDrive\الصور\لقطات الشاشة\لقطة شاشة 2026-06-17 230503.png" docs\screenshots\screenshot-1.png
Copy-Item "C:\Users\LENOVO\OneDrive\الصور\لقطات الشاشة\لقطة شاشة 2026-06-17 225902.png" docs\screenshots\screenshot-2.png
Copy-Item "C:\Users\LENOVO\OneDrive\الصور\لقطات الشاشة\لقطة شاشة 2026-06-17 225850.png" docs\screenshots\screenshot-3.png
Copy-Item "C:\Users\LENOVO\OneDrive\الصور\لقطات الشاشة\لقطة شاشة 2026-06-17 225753.png" docs\screenshots\screenshot-4.png
Copy-Item "C:\Users\LENOVO\OneDrive\الصور\لقطات الشاشة\لقطة شاشة 2026-06-17 223552.png" docs\screenshots\screenshot-5.png
Copy-Item "C:\Users\LENOVO\OneDrive\الصور\لقطات الشاشة\لقطة شاشة 2026-06-17 223502.png" docs\screenshots\screenshot-6.png
```

After copying, you can embed them in the README using standard Markdown such as:

```markdown
![Match View](docs/screenshots/screenshot-1.png)
```

**Quickstart (Development)**

- Backend (Windows, using `py` launcher):
```powershell
cd backend
py -3 -m venv .venv  # optional - only if you want a per-project venv
# If you already have Python packages globally or in user-site, you can install to user
py -3 -m pip install --user -r requirements.txt  # or install packages manually
py -3 App.py
```

- Frontend (requires Node.js 18+)
```bash
cd frontend/app
npm install
npm run dev -- --host 0.0.0.0
# Open http://localhost:5173/
```

**API Endpoints (summary)**
- **GET** `/api/health` — health check and number of songs loaded.
- **GET** `/api/songs` — list songs in database and brief metadata.
- **POST** `/api/songs` — add a new song (multipart/form-data: `file`, `title`, `artist`, `duration`).
- **DELETE** `/api/songs/<song_id>` — delete a song.
- **POST** `/api/match` — match an uploaded humming file against the database (multipart/form-data: `file`, optional `top_k`).
- (If present) **POST** `/api/analyze` — compare two match JSON files (used by the analysis dashboard). If you rely on analysis flows, ensure the backend exposing `/api/analyze` is running.

**Methodology (Technical Explanation)**

- **Audio preprocessing**: Input audio (wav/mp3/m4a) is converted to mono and resampled to a canonical sample rate (e.g., 22050 Hz) using `librosa.load`.

- **Pitch extraction**: The pipeline uses `librosa.pyin` (pYIN) to extract frame-wise fundamental frequency (F0) estimates along with voiced/unvoiced flags and confidence scores. pYIN is robust for vocal melody tracking and handles pitch tracking over noisy frames.

- **Cleaning and interpolation**: Low-confidence frames and unvoiced frames are masked (set to NaN). Short gaps are interpolated (configurable maximum gap) and a median filter is applied to remove spurious outliers.

- **Contour construction**: Continuous pitch values are converted into a simplified melodic contour: for each frame, a label of `+1` (rising), `0` (stable), or `-1` (falling) is computed using pitch differences and a small threshold to avoid over-sensitivity to micro-tremor.

- **Signature generation & storage**: For each song in the database a `MelodySignature` is saved (pitch contour, pitch values, song id, duration). Signatures are stored on disk (pickle format) in the `database/` folder for quick loading.

- **Matching algorithm**: For matching, the system compares the humming signature to every song signature and computes a distance metric over their contours. This can be a DTW (dynamic time warping) distance computed on either the pitch contour or quantized pitch sequence. Results are scored and normalized into a similarity score used to rank candidates.

- **Metadata enrichment**: Match results are enriched with metadata stored in `database/metadata.json` (title, artist, original filename). The API returns `song_id`, `title`, `artist`, `distance`, `similarity_score`, and a `confidence` label (e.g., `high`, `medium`, `low`).

**Design decisions & rationale**
- Using `pyin` (pYIN) gives a robust pitch estimate for vocals and humming — better than simple autocorrelation-based methods for expressive human singing.
- Contour quantization (+1/0/-1) reduces sensitivity to absolute pitch (useful when humming in a different key) and focuses on relative melodic motion.
- DTW provides resilience to tempo differences and incomplete humming samples by aligning sequences non-linearly.

**Performance & tuning**
- Reducing `hop_length` increases pitch resolution at the cost of CPU.
- `fmin`/`fmax` can be tuned to match the expected vocal range of your dataset (e.g., narrower range for male-only humming).
- Database matching is currently an O(N) scan. For large song sets, consider approximate nearest neighbor over learned embeddings (e.g., R-Tree, HNSW over signatures or hashed contours).

**Troubleshooting & Notes**
- If the backend fails to import `librosa` or `numpy`, install dependencies via the Python launcher `py -3 -m pip install --user -r requirements.txt` or the venv pip.
- On Windows, long paths or non-ASCII paths may cause issues with some binary wheels or with the venv launcher; using the `py` launcher or adding the venv `Scripts` path to PATH often helps.
- You may see a warning if other preinstalled packages require older `numpy` versions (e.g., `openvino`). Those warnings indicate a potential compatibility conflict but do not necessarily break this app.

**How you can help me add the screenshots**
If you want me to copy the six absolute paths you provided into the repository, paste `yes` and I will run the copy commands (I already included the PowerShell commands above). If you prefer to do it yourself, run the commands above from a PowerShell prompt.

**License & Credits**
- Attribution: Original project code.
- Libraries: `librosa`, `numpy`, `scipy`, `flask`, `react`, `vite`.

---

If you'd like, I can now:
- copy your screenshots into `docs/screenshots` and embed them in this README (I can do that automatically),
- add a small architecture diagram file, or
- generate a short `requirements.txt` and a `start-dev.sh` / `start-dev.ps1` helper.

Tell me which of these you'd like next.
