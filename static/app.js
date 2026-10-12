const API_URL = "/api/courses";
const pages = ["beranda", "jadwal", "matakuliah"];
const dialog = document.getElementById("course-dialog");
const form = document.getElementById("course-form");
const toast = document.getElementById("toast");
let courses = [];
let toastTimer;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Terjadi kesalahan pada server.");
    return result;
}

function goToPage(pageName) {
    pages.forEach(name => {
        document.getElementById(`page-${name}`).classList.toggle("hidden", name !== pageName);
    });
    document.querySelectorAll("[data-page]").forEach(button => {
        button.classList.toggle("active", button.dataset.page === pageName);
    });
    if (pageName === "jadwal") renderSchedule();
    if (pageName === "matakuliah") renderTable();
}

function sortedCourses(list = courses) {
    const dayOrder = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
    return [...list].sort((a, b) =>
        dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.start.localeCompare(b.start)
    );
}

function scheduleCard(course, showDay = true) {
    const location = [course.room, course.lecturer].filter(Boolean).map(escapeHTML).join(" • ");
    return `
        <article class="schedule-item">
            <div class="time">${showDay ? `${escapeHTML(course.day)}<br>` : ""}${escapeHTML(course.start)}–${escapeHTML(course.end)}</div>
            <div>
                <div class="course-title">${escapeHTML(course.name)}</div>
                <div class="course-meta">${escapeHTML(course.code)} · ${course.sks} SKS${location ? ` · ${location}` : ""}</div>
            </div>
            <div class="course-actions">
                <button class="text-button" data-edit="${course.id}">Edit</button>
                <button class="danger-button" data-delete="${course.id}">Hapus</button>
            </div>
        </article>`;
}

function renderSchedule() {
    const selectedDay = document.getElementById("day-filter").value;
    const list = sortedCourses(courses).filter(course =>
        selectedDay === "Semua" || course.day === selectedDay
    );
    const html = list.length
        ? list.map(course => scheduleCard(course, selectedDay === "Semua")).join("")
        : '<p class="muted empty-state">Tidak ada jadwal untuk pilihan hari ini.</p>';
    document.getElementById("schedule-list").innerHTML = html;
}

function renderHome() {
    const totalSks = courses.reduce((sum, course) => sum + Number(course.sks || 0), 0);
    const days = new Set(courses.map(course => course.day)).size;
    document.getElementById("summary-courses").textContent = courses.length;
    document.getElementById("summary-sks").textContent = totalSks;
    document.getElementById("summary-days").textContent = days;
    const list = sortedCourses(courses).slice(0, 4);
    document.getElementById("home-schedule").innerHTML = list.length
        ? list.map(course => scheduleCard(course)).join("")
        : '<p class="muted empty-state">Belum ada jadwal. Klik “Tambah jadwal” untuk memulai.</p>';
}

function renderTable() {
    const body = document.getElementById("course-table");
    const sorted = sortedCourses();
    document.getElementById("empty-table").classList.toggle("hidden", sorted.length > 0);
    body.innerHTML = sorted.map(course => `
        <tr>
            <td><strong>${escapeHTML(course.name)}</strong><br><span class="muted small">${escapeHTML(course.code)}</span></td>
            <td>${escapeHTML(course.day)}</td>
            <td>${escapeHTML(course.start)}–${escapeHTML(course.end)}</td>
            <td>${course.sks}</td>
            <td>
                <button class="text-button" data-edit="${course.id}">Edit</button>
                <button class="text-button" data-delete="${course.id}" style="color:var(--danger)">Hapus</button>
            </td>
        </tr>`).join("");
}

async function loadCourses() {
    try {
        courses = await apiRequest(API_URL);
        renderHome();
        renderSchedule();
        renderTable();
    } catch (error) {
        showToast(`Tidak dapat memuat data: ${error.message}`);
    }
}

function openForm(course = null) {
    form.reset();
    document.getElementById("form-error").classList.add("hidden");
    document.getElementById("course-id").value = course?.id ?? "";
    document.getElementById("dialog-title").textContent = course ? "Edit mata kuliah" : "Tambah mata kuliah";
    document.getElementById("course-name").value = course?.name ?? "";
    document.getElementById("course-code").value = course?.code ?? "";
    document.getElementById("course-sks").value = course?.sks ?? 3;
    document.getElementById("course-day").value = course?.day ?? "";
    document.getElementById("course-room").value = course?.room ?? "";
    document.getElementById("course-start").value = course?.start ?? "08:00";
    document.getElementById("course-end").value = course?.end ?? "09:40";
    document.getElementById("course-lecturer").value = course?.lecturer ?? "";
    dialog.showModal();
}

function closeForm() {
    dialog.close();
}

function formPayload() {
    return {
        name: document.getElementById("course-name").value.trim(),
        code: document.getElementById("course-code").value.trim(),
        sks: Number(document.getElementById("course-sks").value),
        day: document.getElementById("course-day").value,
        room: document.getElementById("course-room").value.trim(),
        start: document.getElementById("course-start").value,
        end: document.getElementById("course-end").value,
        lecturer: document.getElementById("course-lecturer").value.trim()
    };
}

document.addEventListener("click", async event => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
        event.preventDefault();
        goToPage(pageButton.dataset.page);
        return;
    }

    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
        const course = courses.find(item => item.id === Number(editButton.dataset.edit));
        if (course) openForm(course);
        return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
        const id = Number(deleteButton.dataset.delete);
        const course = courses.find(item => item.id === id);
        if (!course || !confirm(`Hapus mata kuliah "${course.name}"?`)) return;
        try {
            const result = await apiRequest(`${API_URL}/${id}`, { method: "DELETE" });
            showToast(result.message);
            await loadCourses();
        } catch (error) {
            showToast(error.message);
        }
    }
});

document.getElementById("quick-add").addEventListener("click", () => openForm());
document.getElementById("schedule-add").addEventListener("click", () => openForm());
document.getElementById("course-add").addEventListener("click", () => openForm());
document.getElementById("close-dialog").addEventListener("click", closeForm);
document.getElementById("cancel-dialog").addEventListener("click", closeForm);
document.getElementById("day-filter").addEventListener("change", renderSchedule);

form.addEventListener("submit", async event => {
    event.preventDefault();
    const id = document.getElementById("course-id").value;
    const errorBox = document.getElementById("form-error");
    const payload = formPayload();

    if (payload.start >= payload.end) {
        errorBox.textContent = "Jam selesai harus setelah jam mulai.";
        errorBox.classList.remove("hidden");
        return;
    }

    try {
        const result = await apiRequest(id ? `${API_URL}/${id}` : API_URL, {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(payload)
        });
        closeForm();
        showToast(result.warning || (id ? "Mata kuliah berhasil diperbarui." : "Mata kuliah berhasil ditambahkan."));
        await loadCourses();
    } catch (error) {
        errorBox.textContent = error.message;
        errorBox.classList.remove("hidden");
    }
});

// Muat data saat halaman pertama kali dibuka.
loadCourses();
