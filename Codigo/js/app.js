import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const firebaseConfig = {
    apiKey: 'AIzaSyCGRXnpIyIZgdGNQrfnnuUm0Z0vrgBInHE',
    authDomain: 'planner-de-viajes.firebaseapp.com',
    projectId: 'planner-de-viajes',
    storageBucket: 'planner-de-viajes.firebasestorage.app',
    messagingSenderId: '146383933967',
    appId: '1:146383933967:web:bac3a241321c08d5b1897a',
    measurementId: 'G-CD61HCQW5T'
  };

  const app = initializeApp(firebaseConfig);
  getAnalytics(app);
  const db = getFirestore(app);
  const actividadesRef = collection(db, 'actividades');
  const diarioRef = collection(db, 'diario');

  const imageUploadConfig = {
    provider: 'cloudinary',
    cloudinary: {
      cloudName: 'TU_CLOUD_NAME',
      uploadPreset: 'TU_UNSIGNED_UPLOAD_PRESET'
    },
    imgur: {
      clientId: 'TU_IMGUR_CLIENT_ID'
    }
  };

  async function pruebaGuardar() {
    try {
      const docRef = await addDoc(actividadesRef, {
        titulo: 'Prueba conexión',
        detalle: 'Si ves esto en Firebase, está conectado',
        fechaInicio: '2026-06-15',
        fechaFin: '2026-06-16',
        checklist: [],
        icon: '✈️',
        tipo: 'actividad',
        createdAt: serverTimestamp()
      });
      console.log('Documento guardado con ID:', docRef.id);
      return docRef;
    } catch (e) {
      console.error('Error al guardar:', e);
      throw e;
    }
  }

  window.pruebaGuardar = pruebaGuardar;

  async function pruebaLeer() {
    const querySnapshot = await getDocs(actividadesRef);
    querySnapshot.forEach((documento) => {
      console.log(documento.id, ' => ', documento.data());
    });
  }

  window.pruebaLeer = pruebaLeer;

  if (!localStorage.getItem('firebaseConnectionTestSaved')) {
    pruebaGuardar()
      .then(() => localStorage.setItem('firebaseConnectionTestSaved', 'true'));
  }

  pruebaLeer().catch(error => console.error('No se pudieron leer las actividades:', error));

  const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const tripData = {
    activities: [],
    pins: [],
    diaryEntries: [],
    currentMonth: Number(localStorage.getItem('currentMonth')) || 7,
    currentYear: Number(localStorage.getItem('currentYear')) || 2026
  };

  const tabs = document.querySelectorAll('nav a[data-tab]');
  const tabContents = document.querySelectorAll('.tab-content');
  const modal = document.getElementById('activity-modal');
  const activityForm = document.getElementById('activity-form');
  const activityModalTitle = document.getElementById('activity-modal-title');
  const calendarDays = document.getElementById('calendar-days');
  const calendarTitle = document.getElementById('calendar-title');
  const dayDetail = document.getElementById('day-detail');
  const dayDetailTitle = document.getElementById('day-detail-title');
  const dayDetailList = document.getElementById('day-detail-list');
  const pinModal = document.getElementById('pin-modal');
  const pinForm = document.getElementById('pin-form');
  const diaryContainer = document.getElementById('diary-container');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');

  let activityContext = null;
  let selectedDate = null;
  let pendingLatLng = null;

  const map = L.map('map').setView([50.8, 10.5], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  const pinLayer = L.layerGroup().addTo(map);

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(targetId).classList.add('active');
      if (targetId === 'mapa') setTimeout(() => map.invalidateSize(), 0);
    });
  });

  function formatDate(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function addDaysToDate(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  function getDatesBetween(startDate, endDate) {
    const dates = [];
    let cursor = startDate;
    const finalDate = endDate < startDate ? startDate : endDate;
    while (cursor <= finalDate) {
      dates.push(cursor);
      cursor = addDaysToDate(cursor, 1);
    }
    return dates;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]);
  }

  function makeChecklist(rawText, groupId) {
    return rawText
      .split('\n')
      .map(text => text.trim())
      .filter(Boolean)
      .map((text, idx) => ({ id: `${groupId}-task-${idx}-${Date.now()}`, text, done: false }));
  }

  function normalizeChecklist(checklist = []) {
    return checklist
      .map((item, idx) => (
        typeof item === 'string'
          ? { id: `task-${idx}`, text: item, done: false }
          : { id: item.id || `task-${idx}`, text: item.text || '', done: Boolean(item.done) }
      ))
      .filter(item => item.text.trim());
  }

  function expandActivityDoc(docId, data) {
    const fechaInicio = data.fechaInicio || data.date;
    const fechaFin = data.fechaFin || fechaInicio;
    const dates = getDatesBetween(fechaInicio, fechaFin);
    const checklist = normalizeChecklist(data.checklist);

    return dates.map((date, idx) => ({
      id: `${docId}-${idx}`,
      docId,
      groupId: docId,
      name: data.titulo || data.name || 'Sin titulo',
      description: data.detalle || data.description || '',
      icon: data.icon || (data.tipo === 'pin' ? '📍' : '✈️'),
      date,
      fechaInicio,
      fechaFin,
      duration: dates.length,
      dayOffset: idx,
      checklist,
      type: data.tipo || 'actividad',
      lat: data.lat,
      lng: data.lng
    }));
  }

  function closeActivityModal() {
    modal.classList.add('hidden');
    activityForm.reset();
    document.getElementById('activity-duration').value = '1';
    activityContext = null;
  }

  async function createActivity({ titulo, detalle, fechaInicio, fechaFin, icon, checklist, tipo = 'actividad', lat = null, lng = null }) {
    await addDoc(actividadesRef, {
      titulo,
      detalle,
      fechaInicio,
      fechaFin,
      checklist,
      icon,
      tipo,
      lat,
      lng,
      createdAt: serverTimestamp()
    });
  }

  async function updateChecklist(docId, checklist) {
    await updateDoc(doc(db, 'actividades', docId), { checklist });
  }

  async function deleteActivityDoc(docId) {
    await deleteDoc(doc(db, 'actividades', docId));
  }

  function renderChecklist(activity) {
    if (!activity.checklist.length) return '';
    return `
      <ul class="activity-checklist">
        ${activity.checklist.map(item => `
          <li>
            <label>
              <input type="checkbox" data-doc-id="${escapeHtml(activity.docId)}" data-task-id="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''}>
              <span>${escapeHtml(item.text)}</span>
            </label>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function bindChecklistHandlers(scope = document) {
    scope.querySelectorAll('.activity-checklist input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', async () => {
        const docId = input.getAttribute('data-doc-id');
        const taskId = input.getAttribute('data-task-id');
        const activity = tripData.activities.find(act => act.docId === docId);
        if (!activity) return;
        const checklist = activity.checklist.map(item => (
          item.id === taskId ? { ...item, done: input.checked } : item
        ));
        await updateChecklist(docId, checklist);
      });
    });
  }

  function getActivitiesForDate(dateStr) {
    return tripData.activities.filter(act => act.date === dateStr);
  }

  function renderItinerary() {
    const container = document.getElementById('itinerary-container');
    container.innerHTML = '';

    const dateGroups = {};
    tripData.activities.forEach(act => {
      if (!dateGroups[act.date]) dateGroups[act.date] = [];
      dateGroups[act.date].push(act);
    });

    const sortedDates = Object.keys(dateGroups).sort();
    if (!sortedDates.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <p>Añade actividades desde el Itinerario, el Mapa o el calendario en Resumen</p>
        </div>
      `;
      return;
    }

    sortedDates.forEach((dateStr, idx) => {
      const activities = dateGroups[dateStr];
      const card = document.createElement('div');
      card.className = 'day-card';
      card.innerHTML = `
        <div class="day-header">
          <span class="day-number">Día ${idx + 1}</span>
          <span class="day-date">${formatDate(dateStr)}</span>
          <button class="btn-icon btn-remove-day" title="Eliminar día">✕</button>
        </div>
        <ul class="activity-list"></ul>
        <button class="btn-add-activity-itinerary" data-date="${dateStr}">+ Añadir actividad</button>
      `;

      const list = card.querySelector('.activity-list');
      activities.forEach(act => {
        const li = document.createElement('li');
        li.className = 'activity-item';
        li.innerHTML = `
          <span class="activity-icon">${escapeHtml(act.icon)}</span>
          <div class="activity-details">
            <h3 class="activity-name">${escapeHtml(act.name)}</h3>
            ${act.description ? `<p class="activity-description">${escapeHtml(act.description)}</p>` : ''}
            ${act.duration > 1 ? `<span class="activity-duration-badge">${act.dayOffset + 1} de ${act.duration} días</span>` : ''}
            ${renderChecklist(act)}
          </div>
          <button class="btn-icon btn-remove-activity" data-doc-id="${act.docId}" title="Eliminar">✕</button>
        `;
        list.appendChild(li);
      });

      card.querySelector('.btn-remove-day').addEventListener('click', async () => {
        const docIds = [...new Set(activities.map(act => act.docId))];
        await Promise.all(docIds.map(deleteActivityDoc));
      });

      card.querySelector('.btn-add-activity-itinerary').addEventListener('click', () => {
        activityContext = { type: 'itinerary', date: dateStr };
        activityModalTitle.textContent = 'Añadir Actividad';
        modal.classList.remove('hidden');
        document.getElementById('activity-name').focus();
      });

      card.querySelectorAll('.btn-remove-activity').forEach(btn => {
        btn.addEventListener('click', () => deleteActivityDoc(btn.getAttribute('data-doc-id')));
      });

      bindChecklistHandlers(card);
      container.appendChild(card);
    });
  }

  function renderCalendar() {
    const month = tripData.currentMonth;
    const year = tripData.currentYear;
    calendarTitle.textContent = `${MONTHS_ES[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();
    calendarDays.innerHTML = '';

    for (let i = 0; i < startDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day empty';
      calendarDays.appendChild(empty);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';
      dayEl.innerHTML = `<span class="calendar-day-number">${d}</span>`;

      const activities = getActivitiesForDate(dateStr);
      if (activities.length) {
        dayEl.classList.add('has-event');
        const preview = document.createElement('div');
        preview.className = 'calendar-events';
        activities.slice(0, 3).forEach(activity => {
          const event = document.createElement('span');
          event.className = 'calendar-event-title';
          event.textContent = activity.name;
          preview.appendChild(event);
        });
        if (activities.length > 3) {
          const more = document.createElement('span');
          more.className = 'calendar-event-more';
          more.textContent = `+${activities.length - 3}`;
          preview.appendChild(more);
        }
        dayEl.appendChild(preview);
      }

      const today = new Date();
      if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        dayEl.classList.add('today');
      }

      dayEl.addEventListener('click', () => {
        selectedDate = dateStr;
        renderDayDetail();
      });
      calendarDays.appendChild(dayEl);
    }
  }

  function renderDayDetail() {
    if (!selectedDate) return;
    dayDetail.classList.remove('hidden');
    const activities = getActivitiesForDate(selectedDate);
    dayDetailTitle.textContent = `Actividades — ${formatDate(selectedDate)}`;
    dayDetailList.innerHTML = '';

    if (!activities.length) {
      dayDetailList.innerHTML = '<li class="day-detail-empty">No hay actividades este día</li>';
      return;
    }

    activities.forEach(act => {
      const li = document.createElement('li');
      li.className = 'day-detail-item';
      li.innerHTML = `
        <span class="day-detail-item-icon">${escapeHtml(act.icon)}</span>
        <div class="day-detail-copy">
          <h4 class="day-detail-item-name">${escapeHtml(act.name)}</h4>
          ${act.description ? `<p class="day-detail-item-description">${escapeHtml(act.description)}</p>` : ''}
          ${renderChecklist(act)}
        </div>
        ${act.duration > 1 ? `<span class="activity-duration-badge">${act.dayOffset + 1}/${act.duration}</span>` : ''}
        <button class="btn-icon btn-remove-calendar-activity" data-doc-id="${act.docId}" title="Eliminar">✕</button>
      `;
      dayDetailList.appendChild(li);
    });

    dayDetailList.querySelectorAll('.btn-remove-calendar-activity').forEach(btn => {
      btn.addEventListener('click', () => deleteActivityDoc(btn.getAttribute('data-doc-id')));
    });
    bindChecklistHandlers(dayDetailList);
  }

  function renderPinsOnMap() {
    pinLayer.clearLayers();
    tripData.pins.forEach(pin => {
      const marker = L.marker([pin.lat, pin.lng]).addTo(pinLayer);
      const popup = document.createElement('div');
      popup.className = 'pin-popup';
      popup.innerHTML = `
        <strong>${escapeHtml(pin.name)}</strong>
        <span>${formatDate(pin.fechaInicio)}${pin.fechaFin !== pin.fechaInicio ? ` - ${formatDate(pin.fechaFin)}` : ''}</span>
        ${renderChecklist(pin)}
        <button class="btn-danger btn-delete-pin" type="button" data-doc-id="${pin.docId}">Eliminar</button>
      `;
      popup.querySelector('.btn-delete-pin').addEventListener('click', () => deleteActivityDoc(pin.docId));
      bindChecklistHandlers(popup);
      marker.bindPopup(popup);
    });
  }

  function renderPinsList() {
    const container = document.getElementById('pins-list');
    container.innerHTML = '';
    tripData.pins.forEach(pin => {
      const div = document.createElement('div');
      div.className = 'pin-item';
      div.innerHTML = `
        <span class="pin-item-icon">📍</span>
        <div class="pin-item-details">
          <span class="pin-item-name">${escapeHtml(pin.name)}</span>
          <span class="pin-item-coords">${Number(pin.lat).toFixed(4)}, ${Number(pin.lng).toFixed(4)}</span>
          ${renderChecklist(pin)}
        </div>
        <span class="pin-item-date">${formatDate(pin.fechaInicio)}${pin.fechaFin !== pin.fechaInicio ? ` - ${formatDate(pin.fechaFin)}` : ''}</span>
        <button class="btn-danger btn-delete-pin" type="button" data-doc-id="${pin.docId}">Eliminar</button>
      `;
      container.appendChild(div);
    });
    container.querySelectorAll('.btn-delete-pin').forEach(button => {
      button.addEventListener('click', () => deleteActivityDoc(button.getAttribute('data-doc-id')));
    });
    bindChecklistHandlers(container);
  }

  function renderDiary() {
    diaryContainer.innerHTML = '';
    tripData.diaryEntries.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'diary-entry';
      div.innerHTML = `
        <div class="diary-entry-header">
          <div>
            <h3 contenteditable="true" style="outline:none;border-bottom:2px dashed var(--color-primary);padding-bottom:2px;">${escapeHtml(entry.title)}</h3>
            <span class="diary-date">${escapeHtml(entry.date)}</span>
          </div>
          <button class="btn-danger btn-delete-entry" type="button">Eliminar</button>
        </div>
        <p class="diary-text" contenteditable="true" style="outline:none;min-height:60px;">${escapeHtml(entry.text)}</p>
        <div class="diary-photos"></div>
      `;

      const photosDiv = div.querySelector('.diary-photos');
      (entry.photos || []).forEach(photo => {
        const thumb = document.createElement('div');
        thumb.className = 'photo-thumb';
        thumb.innerHTML = `<img src="${photo.url}" alt="Foto">`;
        thumb.querySelector('img').addEventListener('click', () => openLightbox(photo.url));
        photosDiv.appendChild(thumb);
      });

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', (e) => handlePhotoUpload(e, entry));

      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add-photo';
      addBtn.textContent = '+ Foto';
      addBtn.addEventListener('click', () => fileInput.click());

      photosDiv.appendChild(addBtn);
      photosDiv.appendChild(fileInput);

      div.querySelector('h3').addEventListener('blur', (e) => {
        updateDoc(doc(db, 'diario', entry.id), { title: e.target.textContent });
      });

      div.querySelector('p').addEventListener('blur', (e) => {
        updateDoc(doc(db, 'diario', entry.id), { text: e.target.textContent });
      });

      div.querySelector('.btn-delete-entry').addEventListener('click', () => deleteDiaryEntry(entry));
      diaryContainer.appendChild(div);
    });
  }

  async function uploadImageToExternalService(file) {
    if (imageUploadConfig.provider === 'imgur') {
      if (!imageUploadConfig.imgur.clientId || imageUploadConfig.imgur.clientId === 'TU_IMGUR_CLIENT_ID') {
        throw new Error('Configura imageUploadConfig.imgur.clientId para subir fotos a Imgur.');
      }

      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('https://api.imgur.com/3/image', {
        method: 'POST',
        headers: {
          Authorization: `Client-ID ${imageUploadConfig.imgur.clientId}`
        },
        body: formData
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.data?.error || 'No se pudo subir la imagen a Imgur.');
      }
      return result.data.link;
    }

    if (!imageUploadConfig.cloudinary.cloudName || imageUploadConfig.cloudinary.cloudName === 'TU_CLOUD_NAME' ||
        !imageUploadConfig.cloudinary.uploadPreset || imageUploadConfig.cloudinary.uploadPreset === 'TU_UNSIGNED_UPLOAD_PRESET') {
      throw new Error('Configura imageUploadConfig.cloudinary.cloudName y uploadPreset para subir fotos a Cloudinary.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', imageUploadConfig.cloudinary.uploadPreset);
    formData.append('folder', 'diario');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${imageUploadConfig.cloudinary.cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    if (!response.ok || !result.secure_url) {
      throw new Error(result?.error?.message || 'No se pudo subir la imagen a Cloudinary.');
    }
    return result.secure_url;
  }

  async function handlePhotoUpload(e, entry) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    try {
      const uploadedPhotos = [];
      for (const file of files) {
        const url = await uploadImageToExternalService(file);
        uploadedPhotos.push({ url });
      }

      await updateDoc(doc(db, 'diario', entry.id), {
        photos: [...(entry.photos || []), ...uploadedPhotos]
      });
    } catch (error) {
      console.error('Error al subir foto al servicio externo:', error);
      alert(error.message);
    } finally {
      e.target.value = '';
    }
  }

  async function deleteDiaryEntry(entry) {
    await deleteDoc(doc(db, 'diario', entry.id));
  }

  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.remove('hidden');
  }

  function renderAll() {
    renderItinerary();
    renderCalendar();
    renderDayDetail();
    renderPinsOnMap();
    renderPinsList();
    renderDiary();
  }

  activityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('activity-name').value.trim();
    const detalle = document.getElementById('activity-description').value.trim();
    const icon = document.getElementById('activity-icon').value;
    const duration = parseInt(document.getElementById('activity-duration').value, 10) || 1;
    const fechaInicio = activityContext?.date;
    if (!titulo || !fechaInicio) return;

    const groupId = crypto.randomUUID();
    await createActivity({
      titulo,
      detalle,
      fechaInicio,
      fechaFin: addDaysToDate(fechaInicio, duration - 1),
      icon,
      checklist: makeChecklist(document.getElementById('activity-checklist').value, groupId)
    });
    closeActivityModal();
  });

  document.querySelector('.modal-close').addEventListener('click', closeActivityModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeActivityModal();
  });

  document.getElementById('add-day-btn').addEventListener('click', () => {
    const lastDate = tripData.activities.length
      ? tripData.activities.reduce((a, b) => a.date > b.date ? a : b).date
      : new Date().toISOString().split('T')[0];
    const nextDate = addDaysToDate(lastDate, 1);
    activityContext = { type: 'itinerary', date: nextDate };
    activityModalTitle.textContent = `Añadir Actividad — ${formatDate(nextDate)}`;
    modal.classList.remove('hidden');
    document.getElementById('activity-name').focus();
  });

  document.getElementById('prev-month').addEventListener('click', () => {
    tripData.currentMonth--;
    if (tripData.currentMonth < 0) { tripData.currentMonth = 11; tripData.currentYear--; }
    localStorage.setItem('currentMonth', tripData.currentMonth);
    localStorage.setItem('currentYear', tripData.currentYear);
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    tripData.currentMonth++;
    if (tripData.currentMonth > 11) { tripData.currentMonth = 0; tripData.currentYear++; }
    localStorage.setItem('currentMonth', tripData.currentMonth);
    localStorage.setItem('currentYear', tripData.currentYear);
    renderCalendar();
  });

  document.getElementById('close-day-detail').addEventListener('click', () => {
    dayDetail.classList.add('hidden');
    selectedDate = null;
  });

  document.getElementById('add-calendar-activity').addEventListener('click', () => {
    activityContext = { type: 'calendar', date: selectedDate };
    activityModalTitle.textContent = 'Añadir Actividad';
    modal.classList.remove('hidden');
    document.getElementById('activity-name').focus();
  });

  map.on('click', (e) => {
    pendingLatLng = e.latlng;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pin-name').value = '';
    document.getElementById('pin-date').value = today;
    document.getElementById('pin-end-date').value = today;
    document.getElementById('pin-checklist').value = '';
    pinModal.classList.remove('hidden');
    document.getElementById('pin-name').focus();
  });

  document.querySelector('.pin-modal-close').addEventListener('click', () => {
    pinModal.classList.add('hidden');
    pinForm.reset();
    pendingLatLng = null;
  });

  pinModal.addEventListener('click', (e) => {
    if (e.target === pinModal) {
      pinModal.classList.add('hidden');
      pinForm.reset();
      pendingLatLng = null;
    }
  });

  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titulo = document.getElementById('pin-name').value.trim();
    const fechaInicio = document.getElementById('pin-date').value;
    const rawFechaFin = document.getElementById('pin-end-date').value;
    if (!titulo || !fechaInicio || !rawFechaFin || !pendingLatLng) return;

    const fechaFin = rawFechaFin < fechaInicio ? fechaInicio : rawFechaFin;
    const groupId = crypto.randomUUID();
    await createActivity({
      titulo,
      detalle: '',
      fechaInicio,
      fechaFin,
      icon: '📍',
      checklist: makeChecklist(document.getElementById('pin-checklist').value, groupId),
      tipo: 'pin',
      lat: pendingLatLng.lat,
      lng: pendingLatLng.lng
    });

    pinModal.classList.add('hidden');
    pinForm.reset();
    pendingLatLng = null;
  });

  document.getElementById('add-entry-btn').addEventListener('click', async () => {
    const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    await addDoc(diarioRef, {
      title: 'Nueva entrada...',
      date: today,
      text: 'Escribe aquí tu experiencia...',
      photos: [],
      createdAt: serverTimestamp()
    });
  });

  lightbox.addEventListener('click', () => lightbox.classList.add('hidden'));

  onSnapshot(query(actividadesRef, orderBy('fechaInicio', 'asc')), (snapshot) => {
    const docs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    tripData.activities = docs.flatMap(item => expandActivityDoc(item.id, item));
    tripData.pins = tripData.activities
      .filter(item => item.type === 'pin' && item.dayOffset === 0)
      .map(item => ({
        ...item,
        docId: item.docId,
        name: item.name,
        fechaInicio: item.fechaInicio,
        fechaFin: item.fechaFin,
        lat: item.lat,
        lng: item.lng
      }));
    renderAll();
  }, (error) => {
    console.error('Error leyendo actividades desde Firestore:', error);
  });

  onSnapshot(query(diarioRef, orderBy('createdAt', 'desc')), (snapshot) => {
    tripData.diaryEntries = snapshot.docs.map(item => ({
      id: item.id,
      title: item.data().title || 'Nueva entrada...',
      date: item.data().date || '',
      text: item.data().text || '',
      photos: item.data().photos || []
    }));
    renderDiary();
  }, (error) => {
    console.error('Error leyendo diario desde Firestore:', error);
  });

  renderAll();
});
