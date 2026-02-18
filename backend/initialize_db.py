import json
from pathlib import Path
from melody_matcher import MelodyDatabase

# مسار فولدر الأغاني
DATABASE_FOLDER = Path(r'C:\Users\LENOVO\OneDrive\المستندات\DSP\similarityDetection-\backend\database')

# إنشاء قاعدة بيانات
melody_db = MelodyDatabase()
song_metadata = {}

# قراءة كل الملفات الصوتية في الفولدر
for file_path in DATABASE_FOLDER.iterdir():
    if file_path.suffix.lower() in ['.wav', '.mp3', '.flac', '.ogg', '.m4a']:
        song_id = file_path.stem  # اسم الملف بدون امتداد
        try:
            # إضافة الأغنية لـ MelodyDatabase
            signature = melody_db.add_song(song_id, str(file_path))
            
            # حفظ البيانات الوصفية
            song_metadata[song_id] = {
                'title': song_id,
                'artist': 'Unknown',
                'filename': file_path.name
            }
            print(f'Added: {song_id}')
        except Exception as e:
            print(f'Failed: {file_path.name} -> {e}')

# حفظ metadata.json
metadata_file = DATABASE_FOLDER / 'metadata.json'
with open(metadata_file, 'w', encoding='utf-8') as f:
    json.dump(song_metadata, f, indent=2, ensure_ascii=False)

print(f'Total songs added: {len(song_metadata)}')

