from flask import Flask, jsonify, request, render_template
from pathlib import Path
import json

app = Flask(__name__)
DATA_FILE = Path(__file__).with_name("jadwal_data.json")

# Data awal hanya digunakan saat file data belum ada.
INITIAL_DATA = {
    "courses": [
        {
            "id": 1, "name": "Pemrograman Dasar", "code": "TI101",
            "day": "Senin", "start": "08:00", "end": "09:40",
            "room": "Lab Komputer 1", "lecturer": "Dosen A", "sks": 3
        },
        {
            "id": 2, "name": "Matematika Diskrit", "code": "TI102",
            "day": "Selasa", "start": "10:00", "end": "11:40",
            "room": "Ruang 202", "lecturer": "Dosen B", "sks": 3
        },
        {
            "id": 3, "name": "Basis Data", "code": "TI103",
            "day": "Rabu", "start": "13:00", "end": "14:40",
            "room": "Ruang 203", "lecturer": "Dosen C", "sks": 3
        }
    ]
}

DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]


def load_data():
    """Membaca jadwal dari file JSON; membuat data awal bila belum tersedia."""
    if not DATA_FILE.exists():
        save_data(INITIAL_DATA)
    try:
        with DATA_FILE.open("r", encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, dict) or not isinstance(data.get("courses"), list):
            raise ValueError("Format data tidak sesuai.")
        return data
    except (json.JSONDecodeError, ValueError):
        # Hindari aplikasi langsung berhenti jika file JSON rusak.
        save_data(INITIAL_DATA)
        return json.loads(json.dumps(INITIAL_DATA))


def save_data(data):
    with DATA_FILE.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def next_id(courses):
    return max((course.get("id", 0) for course in courses), default=0) + 1


def validate_course(payload):
    """Memeriksa data dari formulir sebelum disimpan."""
    required = ["name", "code", "day", "start", "end", "room"]
    for field in required:
        if not str(payload.get(field, "")).strip():
            return f"Kolom {field} wajib diisi."

    if payload["day"] not in DAYS:
        return "Hari kuliah tidak valid."

    # Input type=time mengirim format HH:MM sehingga bisa dibandingkan sebagai teks.
    start = str(payload["start"])
    end = str(payload["end"])
    if len(start) != 5 or len(end) != 5 or start >= end:
        return "Jam selesai harus setelah jam mulai."

    try:
        sks = int(payload.get("sks", 2))
        if not 1 <= sks <= 6:
            return "Jumlah SKS harus antara 1 sampai 6."
    except (TypeError, ValueError):
        return "Jumlah SKS harus berupa angka."

    return None


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/courses")
def get_courses():
    data = load_data()
    courses = sorted(
        data["courses"],
        key=lambda course: (DAYS.index(course["day"]), course["start"])
    )
    return jsonify(courses)


@app.post("/api/courses")
def add_course():
    payload = request.get_json(silent=True) or {}
    error = validate_course(payload)
    if error:
        return jsonify({"error": error}), 400

    data = load_data()
    course = {
        "id": next_id(data["courses"]),
        "name": str(payload["name"]).strip(),
        "code": str(payload["code"]).strip().upper(),
        "day": payload["day"],
        "start": payload["start"],
        "end": payload["end"],
        "room": str(payload["room"]).strip(),
        "lecturer": str(payload.get("lecturer", "")).strip(),
        "sks": int(payload.get("sks", 2))
    }

    # Peringatan bentrok bila hari sama dan rentang waktunya tumpang tindih.
    conflicts = []
    for existing in data["courses"]:
        overlaps = course["start"] < existing["end"] and course["end"] > existing["start"]
        if existing["day"] == course["day"] and overlaps:
            conflicts.append(existing["name"])

    data["courses"].append(course)
    save_data(data)
    return jsonify({
        "course": course,
        "warning": (
            "Perhatian: jadwal bertabrakan dengan " + ", ".join(conflicts) + "."
            if conflicts else None
        )
    }), 201


@app.put("/api/courses/<int:course_id>")
def update_course(course_id):
    payload = request.get_json(silent=True) or {}
    error = validate_course(payload)
    if error:
        return jsonify({"error": error}), 400

    data = load_data()
    course = next((item for item in data["courses"] if item["id"] == course_id), None)
    if course is None:
        return jsonify({"error": "Mata kuliah tidak ditemukan."}), 404

    updated = {
        "id": course_id,
        "name": str(payload["name"]).strip(),
        "code": str(payload["code"]).strip().upper(),
        "day": payload["day"],
        "start": payload["start"],
        "end": payload["end"],
        "room": str(payload["room"]).strip(),
        "lecturer": str(payload.get("lecturer", "")).strip(),
        "sks": int(payload.get("sks", 2))
    }

    conflicts = []
    for existing in data["courses"]:
        if existing["id"] == course_id:
            continue
        overlaps = updated["start"] < existing["end"] and updated["end"] > existing["start"]
        if existing["day"] == updated["day"] and overlaps:
            conflicts.append(existing["name"])

    index = next(i for i, item in enumerate(data["courses"]) if item["id"] == course_id)
    data["courses"][index] = updated
    save_data(data)
    return jsonify({
        "course": updated,
        "warning": (
            "Perhatian: jadwal bertabrakan dengan " + ", ".join(conflicts) + "."
            if conflicts else None
        )
    })


@app.delete("/api/courses/<int:course_id>")
def delete_course(course_id):
    data = load_data()
    original_count = len(data["courses"])
    data["courses"] = [item for item in data["courses"] if item["id"] != course_id]
    if len(data["courses"]) == original_count:
        return jsonify({"error": "Mata kuliah tidak ditemukan."}), 404
    save_data(data)
    return jsonify({"message": "Mata kuliah berhasil dihapus."})


@app.get("/api/summary")
def summary():
    courses = load_data()["courses"]
    return jsonify({
        "course_count": len(courses),
        "total_sks": sum(int(course.get("sks", 0)) for course in courses),
        "day_count": len(set(course["day"] for course in courses))
    })


if __name__ == "__main__":
    # Jalankan di komputer sendiri, lalu buka alamat yang muncul di terminal.
    app.run(debug=True)
