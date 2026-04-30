document.addEventListener('DOMContentLoaded', () => {
    // Supabase Configuration
    const SUPABASE_URL = 'https://khusewhkdzjtlnnmepmv.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtodXNld2hrZHpqdGxubm1lcG12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzEwODQsImV4cCI6MjA5MzEwNzA4NH0.5PzalNC2qJWfv60Ysv1uXS26Gyd10q-d7i8rlIQ8Hm8';
    
    if (!window.supabase) {
        console.error("Supabase library not loaded");
        return;
    }
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // MASTER ADMIN CREDENTIALS
    const ADMIN_EMAIL = 'admin@admin.com';

    // DOM Elements
    const viewAuth = document.getElementById('view-auth');
    const viewSetup = document.getElementById('view-setup');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewAdmin = document.getElementById('view-admin');
    const btnReset = document.getElementById('btn-reset');
    const btnLogout = document.getElementById('btn-logout');
    const setupForm = document.getElementById('setup-form');
    const authForm = document.getElementById('auth-form');
    const userDisplay = document.getElementById('user-display');
    const appNav = document.getElementById('app-nav');
    const swimmerListBody = document.getElementById('swimmer-list-body');
    const createSwimmerForm = document.getElementById('create-swimmer-form');
    
    // Dashboard Elements
    const elDashEvent = document.getElementById('dash-event');
    const elDashCurrent = document.getElementById('dash-current');
    const elDashTarget = document.getElementById('dash-target');
    const elDashDaysLeft = document.getElementById('dash-days-left');
    const elDashStage = document.getElementById('dash-stage');
    const elDashFocus = document.getElementById('dash-focus');
    
    // Calendar & Plan Elements
    const planDateTitle = document.getElementById('plan-date-title');
    const planIntensity = document.getElementById('plan-intensity');
    const planGymDesc = document.getElementById('plan-gym-desc');
    const planPoolDesc = document.getElementById('plan-pool-desc');
    
    const workoutCards = {
        gym: document.querySelector('.workout-card.gym'),
        pool: document.querySelector('.workout-card.pool')
    };

    // State
    let appState = {
        event: null,
        compName: null,
        startDateStr: null,
        targetDate: null,
        currentTime: null,
        targetTime: null,
        selectedDateStr: null,
        currentCalMonth: new Date().getMonth(),
        currentCalYear: new Date().getFullYear(),
        measurements: []
    };

    let progressChart = null;

    // Initialization
    init();

    async function init() {
        // Listen for auth changes
        supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                userDisplay.textContent = session.user.email;
                appNav.classList.remove('hidden');
                checkUserRole(session.user.id);
                checkPlan();
            } else {
                userDisplay.textContent = '';
                appNav.classList.add('hidden');
                showAuth();
            }
        });

        // Tab Navigation
        const navCoach = document.getElementById('nav-coach');
        const navAdmin = document.getElementById('nav-admin');

        if (navCoach) {
            navCoach.onclick = () => {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                navCoach.classList.add('active');
                checkPlan();
            };
        }

        if (navAdmin) {
            navAdmin.onclick = () => {
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                navAdmin.classList.add('active');
                showAdmin();
            };
        }

        // Auth Logic
        const btnLogin = document.getElementById('btn-login');
        const btnSignup = document.getElementById('btn-signup');

        if (btnLogin) {
            btnLogin.onclick = async (e) => {
                e.preventDefault();
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;
                if (!email || !password) return alert("Por favor llena todos los campos");
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) alert('Error al iniciar sesión: ' + error.message);
            };
        }

        if (btnSignup) {
            btnSignup.onclick = async (e) => {
                e.preventDefault();
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;
                if (!email || !password) return alert("Por favor llena todos los campos");
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) alert('Error al crear cuenta: ' + error.message);
                else alert('¡Cuenta creada! Ya puedes iniciar sesión.');
            };
        }

        // Logout
        btnLogout.onclick = async () => {
            await supabase.auth.signOut();
        };

        // Reset
        btnReset.onclick = async () => {
            if (confirm('¿Seguro que quieres reiniciar tu plan de entrenamiento?')) {
                const { data: { user } } = await supabase.auth.getUser();
                await supabase.from('swim_plans').delete().eq('user_id', user.id);
                appState.event = null;
                appState.measurements = [];
                setupForm.reset();
                showSetup();
            }
        };

        // Calendar Nav
        document.getElementById('cal-prev').onclick = () => {
            appState.currentCalMonth--;
            if (appState.currentCalMonth < 0) {
                appState.currentCalMonth = 11;
                appState.currentCalYear--;
            }
            generateCalendar();
        };

        document.getElementById('cal-next').onclick = () => {
            appState.currentCalMonth++;
            if (appState.currentCalMonth > 11) {
                appState.currentCalMonth = 0;
                appState.currentCalYear++;
            }
            generateCalendar();
        };

        // Measurement Form Toggle
        const btnToggleMeasure = document.getElementById('btn-toggle-measure');
        const measurementForm = document.getElementById('measurement-form');
        const btnCancelMeasure = document.getElementById('btn-cancel-measure');

        if (btnToggleMeasure) {
            btnToggleMeasure.onclick = () => {
                measurementForm.classList.remove('hidden');
                document.getElementById('measure-date').value = getLocalIsoDate(new Date());
            };
        }

        if (btnCancelMeasure) {
            btnCancelMeasure.onclick = () => {
                measurementForm.classList.add('hidden');
                measurementForm.reset();
            };
        }

        if (measurementForm) {
            measurementForm.onsubmit = async (e) => {
                e.preventDefault();
                const date = document.getElementById('measure-date').value;
                const time = document.getElementById('measure-time').value;

                const newMeasure = { date, time_string: time, seconds: timeToSeconds(time) };
                if (!appState.measurements) appState.measurements = [];
                appState.measurements.push(newMeasure);
                appState.measurements.sort((a, b) => new Date(a.date) - new Date(b.date));

                await saveMeasurement(newMeasure);
                measurementForm.classList.add('hidden');
                measurementForm.reset();
                renderDashboard();
            };
        }

        // Setup Form
        setupForm.onsubmit = async (e) => {
            e.preventDefault();
            const todayStr = getLocalIsoDate(new Date());
            appState = {
                ...appState,
                event: document.getElementById('event-select').value,
                compName: document.getElementById('comp-name').value || "CAMPEONATO",
                startDateStr: todayStr,
                targetDate: document.getElementById('target-date').value,
                currentTime: document.getElementById('current-time').value,
                targetTime: document.getElementById('target-time').value,
                selectedDateStr: todayStr,
                currentCalMonth: new Date().getMonth(),
                currentCalYear: new Date().getFullYear(),
                measurements: appState.measurements || []
            };
            await savePlan();
            renderDashboard();
            showDashboard();
        };

        // Create Swimmer Form (Admin)
        if (createSwimmerForm) {
            createSwimmerForm.onsubmit = async (e) => {
                e.preventDefault();
                const name = document.getElementById('swimmer-name').value;
                const email = document.getElementById('swimmer-email').value;
                const password = document.getElementById('swimmer-pass').value;

                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: name } }
                });

                if (error) alert('Error: ' + error.message);
                else {
                    alert('Nadador registrado exitosamente.');
                    createSwimmerForm.reset();
                    fetchSwimmers();
                }
            };
        }
    }

    // --- LOGIC FUNCTIONS ---

    async function checkUserRole(userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email === ADMIN_EMAIL) {
            document.getElementById('nav-admin').classList.remove('hidden');
            await supabase.from('profiles').upsert({ id: userId, email: user.email, role: 'admin' });
        } else {
            document.getElementById('nav-admin').classList.add('hidden');
        }
    }

    async function saveMeasurement(measure) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('measurements').insert({
            user_id: user.id,
            date: measure.date,
            time_string: measure.time_string,
            seconds: measure.seconds
        });
    }

    async function savePlan() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { measurements, ...planOnly } = appState;
        
        console.log("Guardando plan en Supabase para el usuario:", user.id);
        const { error } = await supabase.from('swim_plans').upsert({
            user_id: user.id,
            plan_data: planOnly
        });

        if (error) {
            console.error("Error al guardar el plan:", error.message, error.details, error.hint);
            alert("Error al guardar el plan: " + error.message + " (Detalles: " + (error.details || 'Ninguno') + ")");
        } else {
            console.log("Plan guardado exitosamente.");
        }
    }

    async function loadPlan() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        console.log("Buscando plan existente para el usuario...");
        const { data: planData, error: planError } = await supabase.from('swim_plans').select('plan_data').eq('user_id', user.id).single();
        
        if (planError) {
            console.warn("No se encontró un plan o hubo un error:", planError.message);
        }

        if (planData && planData.plan_data && planData.plan_data.event) {
            console.log("Plan encontrado:", planData.plan_data.event);
            // Migración/Actualización para planes antiguos
            const updatedPlan = {
                ...planData.plan_data,
                startDateStr: planData.plan_data.startDateStr || getLocalIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // Default 30 días atrás
                compName: planData.plan_data.compName || "Competencia",
                measurements: appState.measurements || []
            };
            appState = { ...appState, ...updatedPlan };
        } else {
            console.log("El usuario no tiene un plan activo.");
        }

        const { data: measureData } = await supabase
            .from('measurements')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: true });
        
        appState.measurements = measureData || [];
    }

    async function checkPlan() {
        await loadPlan();
        if (appState.event) {
            showDashboard();
        } else {
            showSetup();
        }
    }

    function showAuth() {
        viewDashboard.classList.remove('active');
        viewSetup.classList.remove('active');
        viewAdmin.classList.remove('active');
        viewAuth.style.display = 'block';
        viewDashboard.style.display = 'none';
        viewSetup.style.display = 'none';
        viewAdmin.style.display = 'none';
        setTimeout(() => viewAuth.classList.add('active'), 50);
        btnLogout.classList.add('hidden');
        btnReset.classList.add('hidden');
    }

    function showSetup() {
        viewAuth.classList.remove('active');
        viewDashboard.classList.remove('active');
        viewAdmin.classList.remove('active');
        viewSetup.style.display = 'block';
        viewAuth.style.display = 'none';
        viewDashboard.style.display = 'none';
        viewAdmin.style.display = 'none';
        setTimeout(() => viewSetup.classList.add('active'), 50);
        btnLogout.classList.remove('hidden');
        btnReset.classList.add('hidden');
    }

    function showDashboard() {
        viewAuth.classList.remove('active');
        viewSetup.classList.remove('active');
        viewAdmin.classList.remove('active');
        viewDashboard.style.display = 'block';
        viewAuth.style.display = 'none';
        viewSetup.style.display = 'none';
        viewAdmin.style.display = 'none';
        setTimeout(() => viewDashboard.classList.add('active'), 50);
        btnLogout.classList.remove('hidden');
        btnReset.classList.remove('hidden');
        renderDashboard();
    }

    function showAdmin() {
        viewAuth.classList.remove('active');
        viewSetup.classList.remove('active');
        viewDashboard.classList.remove('active');
        viewAdmin.style.display = 'block';
        viewAuth.style.display = 'none';
        viewSetup.style.display = 'none';
        viewDashboard.style.display = 'none';
        setTimeout(() => viewAdmin.classList.add('active'), 50);
        btnLogout.classList.remove('hidden');
        btnReset.classList.add('hidden');
        fetchSwimmers();
    }

    async function fetchSwimmers() {
        const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
        const { data: plans } = await supabase.from('swim_plans').select('user_id');

        if (profiles) {
            swimmerListBody.innerHTML = '';
            profiles.forEach(p => {
                if (p.email === ADMIN_EMAIL) return;
                const hasPlan = plans.some(pl => pl.user_id === p.id);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${p.full_name || 'Sin nombre'}</td>
                    <td>${p.email}</td>
                    <td><span class=\"status-badge ${hasPlan ? 'status-active' : 'status-pending'}\">${hasPlan ? 'Plan Activo' : 'Sin Plan'}</span></td>
                    <td>
                        <button class=\"btn-text danger\" onclick=\"deleteSwimmer('${p.id}', '${p.full_name}')\">Eliminar</button>
                    </td>
                `;
                swimmerListBody.appendChild(row);
            });
        }
    }

    window.deleteSwimmer = async (userId, name) => {
        if (confirm(`¿Eliminar a ${name}?`)) {
            await supabase.from('measurements').delete().eq('user_id', userId);
            await supabase.from('swim_plans').delete().eq('user_id', userId);
            await supabase.from('profiles').delete().eq('id', userId);
            fetchSwimmers();
        }
    };

    function renderDashboard() {
        elDashEvent.textContent = appState.event;
        elDashCurrent.textContent = appState.currentTime;
        elDashTarget.textContent = appState.targetTime;

        const today = new Date(); today.setHours(0,0,0,0);
        const target = new Date(appState.targetDate + 'T00:00:00');
        const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            elDashDaysLeft.textContent = `¡Competencia Finalizada!`;
            elDashStage.textContent = 'Post-Temporada';
        } else {
            elDashDaysLeft.textContent = `${diffDays} días restantes`;
            if (diffDays > 60) elDashStage.textContent = 'Base Aeróbica';
            else if (diffDays > 30) elDashStage.textContent = 'Desarrollo Específico';
            else if (diffDays > 10) elDashStage.textContent = 'Velocidad y Ritmo';
            else elDashStage.textContent = 'Tapering (Descarga)';
        }

        generateCalendar();
        renderVerticalPool();
        renderProgressChart();
        updateMeasurementsList();
        renderDailyPlan(appState.selectedDateStr || getLocalIsoDate(today));
    }

    function generateCalendar() {
        const grid = document.getElementById('calendar-grid');
        const label = document.getElementById('cal-month-year');
        if (!grid) return;
        grid.innerHTML = '';
        
        const first = new Date(appState.currentCalYear, appState.currentCalMonth, 1);
        const last = new Date(appState.currentCalYear, appState.currentCalMonth + 1, 0);
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        label.textContent = `${months[appState.currentCalMonth]} ${appState.currentCalYear}`;

        for (let i = 0; i < first.getDay(); i++) {
            const e = document.createElement('div'); e.className = 'cal-day other-month';
            grid.appendChild(e);
        }

        const todayStr = getLocalIsoDate(new Date());
        for (let d = 1; d <= last.getDate(); d++) {
            const date = new Date(appState.currentCalYear, appState.currentCalMonth, d);
            const dateStr = getLocalIsoDate(date);
            const dayEl = document.createElement('div');
            dayEl.className = 'cal-day' + (dateStr === todayStr ? ' today' : '') + (dateStr === appState.selectedDateStr ? ' active' : '');
            dayEl.innerHTML = `<span class=\"day-num\">${d}</span><div class=\"indicators\">${[1,3,5].includes(date.getDay()) ? '<div class=\"dot gym\"></div>' : ''}${date.getDay()!==0 ? '<div class=\"dot pool\"></div>' : ''}</div>`;
            dayEl.onclick = () => {
                appState.selectedDateStr = dateStr;
                renderDashboard();
            };
            grid.appendChild(dayEl);
        }
    }

    function renderVerticalPool() {
        const stageContainer = document.getElementById('pool-v-stages');
        const indicator = document.getElementById('swimmer-v-indicator');
        if (!stageContainer) return;
        stageContainer.innerHTML = '';

        const start = new Date(appState.startDateStr + 'T00:00:00');
        const target = new Date(appState.targetDate + 'T00:00:00');
        const today = new Date(); today.setHours(0,0,0,0);
        const total = Math.ceil((target - start) / (1000 * 60 * 60 * 24)) || 1;
        const progress = Math.min(100, Math.max(0, (Math.ceil((today - start) / (1000 * 60 * 60 * 24)) / total) * 100));
        
        setTimeout(() => indicator.style.bottom = `${progress}%`, 100);

        [{n:'Base',d:Math.max(0,total-60),c:'bg-base'},{n:'Des',d:Math.max(0,30),c:'bg-desarrollo'},{n:'Vel',d:Math.max(0,20),c:'bg-velocidad'},{n:'Tap',d:10,c:'bg-tapering'}].forEach(s => {
            const z = document.createElement('div'); z.className = `pool-v-stage-zone ${s.c}`; z.style.height = `${(s.d/total)*100}%`;
            stageContainer.appendChild(z);
        });
    }

    function renderProgressChart() {
        const ctx = document.getElementById('progressChart');
        if (!ctx || !window.Chart) return;
        if (progressChart) progressChart.destroy();
        const m = appState.measurements || [];
        progressChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Inicio', ...m.map(x => x.date), 'Meta'],
                datasets: [{ 
                    data: [timeToSeconds(appState.currentTime), ...m.map(x => x.seconds), timeToSeconds(appState.targetTime)], 
                    borderColor: '#0ea5e9', 
                    fill: true, 
                    tension: 0.4 
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                scales: {
                    y: {
                        ticks: {
                            callback: (value) => secondsToTime(value),
                            color: 'rgba(255,255,255,0.5)'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)' },
                        grid: { display: false }
                    }
                },
                plugins: { legend: { display: false } } 
            }
        });
    }

    function secondsToTime(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 100);
        return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    function updateMeasurementsList() {
        const list = document.getElementById('measurements-list');
        if (list) list.innerHTML = (appState.measurements || []).map(m => `<div class=\"measure-item\"><span>${m.date}</span><span>${m.time_string}</span></div>`).join('');
    }

    function getDailySeed(dateStr) {
        let hash = 0;
        for (let i = 0; i < dateStr.length; i++) {
            hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function renderDailyPlan(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = d.getDay(); // 0=Dom, 1=Lun...
        const todayStr = getLocalIsoDate(new Date());
        const seed = getDailySeed(dateStr);
        
        planDateTitle.textContent = dateStr === todayStr ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        planDateTitle.style.textTransform = 'capitalize';

        const stage = elDashStage.textContent;
        const eventParts = appState.event ? appState.event.split(' ') : ['50m', 'Libre'];
        const distance = parseInt(eventParts[0]) || 50;
        const style = eventParts[1] || 'Libre';
        
        let distCat = 'MID';
        if (distance <= 100) distCat = 'SPRINT';
        else if (distance >= 800) distCat = 'LONG';

        const hasGym = [1, 3, 5].includes(dayOfWeek); // Lunes, Miércoles, Viernes
        const hasPool = dayOfWeek !== 0; // Lunes a Sábado

        let gymDesc = '';
        let poolDesc = '';
        let intensity = 'Baja';

        if (stage.includes('Post-Temporada')) {
            if (hasGym) gymDesc = "• Descanso activo. Estiramientos suaves y movilidad articular (15 min).\n• Yoga o Pilates ligero.";
            if (hasPool) poolDesc = "• Nado suave continuo: 15-20 minutos.\n• Juegos acuáticos o técnica muy relajada.\n• Sin control de tiempos ni ritmos.";
            intensity = 'Baja';
        } else {
            // --- GYM WORKOUTS POOL ---
            const gymPools = {
                'Base': [
                    `OBJETIVO: Adaptación Anatómica (Circuito A)\n\n• Calentamiento: 10 min movilidad + activación con bandas.\n• Circuito (3x15, desc. 45s):\n   - Sentadilla Goblet\n   - Dominadas asistidas\n   - Flexiones (Push-ups)\n   - Remo a una mano\n• Core: Plancha frontal 3x1min + Superman 3x15.`,
                    `OBJETIVO: Estabilidad y Core (Circuito B)\n\n• Calentamiento: Saltos suaves + movilidad cadera.\n• Bloque (3x12, desc. 60s):\n   - Lunges (Zancadas) alternas\n   - Press militar con mancuernas\n   - Peso muerto con poco peso\n   - Bird-dog (Estabilidad)\n• Core: Russian Twists 3x30 + Deadbug 3x15.`,
                    `OBJETIVO: Resistencia de Base (Circuito C)\n\n• Calentamiento: 10 min elíptica o trote suave.\n• AMRAP 15 min (Tantas rondas como sea posible):\n   - 15 Sentadillas aire\n   - 10 Flexiones\n   - 15 KB Swings (suave)\n   - 20 Escaladores (Mountain Climbers)\n• Estiramiento profundo 10 min.`
                ],
                'Desarrollo': [
                    `OBJETIVO: Fuerza Máxima (Bloque A)\n\n• Calentamiento: Dinámico + activación neuromuscular.\n• Bloque Principal (4x6, peso 85%, desc. 3 min):\n   - Sentadilla trasera con barra\n   - Press de banca\n   - Dominadas lastradas\n• Trabajo Compensatorio: Rotadores 3x12.\n• Core: Rueda abdominal 3x10.`,
                    `OBJETIVO: Potencia y Explosividad (Bloque B)\n\n• Calentamiento: 15 min movilidad articular.\n• Bloque (4x8, explosivo, desc. 2 min):\n   - Clean & Press con mancuernas\n   - Box Jumps (Saltos al cajón)\n   - Lanzamiento balón medicinal\n   - Remo invertido TRX\n• Core: Plancha lateral con rotación 3x12/lado.`,
                    `OBJETIVO: Hipertrofia Funcional (Bloque C)\n\n• Calentamiento: Movilidad espinal y hombros.\n• Bloque (3x10, desc. 90s):\n   - Prensa de piernas\n   - Jalón al pecho\n   - Press inclinado mancuernas\n   - Zancadas laterales\n• Core: Elevación de piernas colgado 3x12.`
                ],
                'Velocidad': [
                    `OBJETIVO: Potencia Explosiva (SPRINT Focus)\n\n• Calentamiento: Movilidad + Saltos cortos.\n• Pliometría (5x3, máxima velocidad, desc. 3 min):\n   - Saltos al cajón altos\n   - Slam Ball (lanzamiento al suelo)\n   - Flexiones explosivas\n• Core: Lanzamientos rotacionales 3x8/lado.`,
                    `OBJETIVO: Mantenimiento de Potencia (Variante B)\n\n• Calentamiento: Movilidad articular completa.\n• Circuito Potencia (3x8 reps explosivas):\n   - Squat Jumps\n   - Dominadas rápidas\n   - Press militar\n• Core: Plancha con toque de hombros 3x20.`,
                    `OBJETIVO: Activación y Recobro (Variante C)\n\n• Calentamiento: Rodillo de espuma (Foam Roller).\n• Activación (3x10 rápidas, peso ligero):\n   - Kettlebell Swings\n   - Push Press\n   - Remo en polea baja\n• Estiramientos dinámicos.`
                ],
                'Tapering': [
                    `OBJETIVO: Activación Neural (Descarga A)\n\n• Sesión corta (25 min).\n• Movilidad dinámica.\n• 3x5 reps peso corporal (saltos, flexiones) - Sentirse 'eléctrico'.\n• NO FATIGA acumulada.`,
                    `OBJETIVO: Movilidad y Sensación (Descarga B)\n\n• 15 min Foam Roller.\n• Estiramientos activos cortos.\n• 2x8 reps muy ligeras de ejercicios multiarticulares.\n• Enfoque en la relajación mental.`,
                    `OBJETIVO: Último Toque (Descarga C)\n\n• Movilidad articular suave.\n• Activación de core (Isométricos suaves).\n• Visualización de la competencia.\n• Hidratación y descanso.`
                ]
            };

            // --- POOL RHYTHM CALCULATIONS ---
            const targetSecs = timeToSeconds(appState.targetTime) || (distance * 1);
            const currentSecs = timeToSeconds(appState.currentTime) || (targetSecs * 1.10);
            const targetPace100 = (targetSecs / distance) * 100;
            const currentPace100 = (currentSecs / distance) * 100;

            const fmt = (s) => {
                const m = Math.floor(s / 60);
                const sec = Math.floor(s % 60);
                return `${m}:${sec.toString().padStart(2, '0')}`;
            };

            const pZ1 = fmt(currentPace100 * 1.30); // Aeróbico regenerativo
            const pZ2 = fmt(currentPace100 * 1.20); // Aeróbico ligero
            const pZ3 = fmt(currentPace100 * 1.12); // Umbral / Aeróbico intenso
            const pZ4 = fmt(targetPace100 * 1.05);  // Ritmo de carrera + margen
            const racePace = fmt(targetPace100);
            const sprintPace = fmt(targetPace100 * 0.95);

            // --- POOL WORKOUT TEMPLATES ---
            const poolWorkouts = {
                'Base': {
                    'SPRINT': [
                        `WARMUP: 400m Libre + 4x100m Estilos (técnica) c/15".\nMAIN: 12x50m ${style} (Z2 - Ritmo: ${pZ2}) c/1:00.\n8x25m ${style} (Fuerza: Patada fuerte con tabla) c/45".\n4x100m Pullbuoy (Z1) c/20".`,
                        `WARMUP: 300m Libre + 6x50m Drill (técnica ${style}) c/15".\nMAIN: 4x200m Libre (Z2 - Ritmo: ${fmt(currentPace100 * 1.2 * 2)}) c/3:30.\n16x25m ${style} (Paso de 200m: ${fmt(targetPace100/2)}) c/40".\n200m Afloje.`,
                        `WARMUP: 500m (200m Nado/100m Patada/200m Pull).\nMAIN: 20x50m ${style} (Z2 constante) c/1:05.\nFoco en: Contar brazadas por piscina, mantener consistencia.\n4x50m Aceleraciones finales.`
                    ],
                    'MID': [
                        `WARMUP: 400m Libre + 8x50m (25m técnica/25m nado).\nMAIN: 3x(4x100m ${style} Z2 Ritmo: ${pZ2} c/1:40 + 100m suave).\n8x50m Patada ${style} (Intensidad media) c/1:10.\n400m Pullbuoy y paletas.`,
                        `WARMUP: 600m Mixto.\nMAIN: 2 x 400m Libre (Z2) c/6:00.\n6 x 200m ${style} (Pull/Paletas opcional - Ritmo: ${fmt(currentPace100 * 1.15 * 2)}) c/3:15.\n300m Afloje variando estilos.`,
                        `WARMUP: 400m + 4x100m Estilos.\nMAIN: Escalera: 100-200-300-400-300-200-100m Libre (Z2) desc. 20".\nEn las bajadas, intentar ritmo ${pZ3}.\n200m Técnica ${style}.`
                    ],
                    'LONG': [
                        `WARMUP: 800m Continuo.\nMAIN: 2 x 1000m Libre (Z2 - Ritmo: ${pZ2}/100m) desc. 1 min.\nFoco: Respiración bilateral y agarre.\n4x100m ${style} técnica c/20".`,
                        `WARMUP: 600m (200m nado/200m técnica/200m pull).\nMAIN: 10x200m Libre (Z2 alto - Ritmo: ${fmt(currentPace100 * 1.18 * 2)}) c/3:30.\n8x50m Patada con aletas c/1:00.\n400m Afloje.`,
                        `WARMUP: 400m + 8x50m Estilos.\nMAIN: 1x1500m Libre (Test de ritmo Z2 - Clavar ${pZ2} cada 100m).\n4x200m Pullbuoy (Z1) c/20".`
                    ]
                },
                'Desarrollo': {
                    'SPRINT': [
                        `WARMUP: 400m + 4x50m Aceleraciones.\nMAIN: Tolerancia al Lactato:\n4x(50m ${style} A TOPE - Ritmo Carrera: ${fmt(targetPace100/2)} + 50m muy suave) c/5:00.\n8x25m ${style} Salidas de bloque c/1:30.\n400m Afloje.`,
                        `WARMUP: 300m + 8x25m Drill.\nMAIN: Velocidad Resistida:\n12x25m ${style} (SPRINT con paletas y aletas) c/1:00.\n1x200m Libre fuerte (Z4) - Tiempo ref: ${fmt(targetPace100 * 1.05 * 2)}.\n200m Afloje activo.`,
                        `WARMUP: 500m variado.\nMAIN: Bloque Potencia:\n16x50m ${style} (Impares: Z4 Ritmo: ${fmt(targetPace100/2 * 1.05)} / Pares: Z2) c/1:15.\n6x50m Patada explosiva c/1:30.`
                    ],
                    'MID': [
                        `WARMUP: 400m + 4x100m Mixto.\nMAIN: Umbral Anaeróbico:\n8x200m ${style} (Z3/Z4 - Ritmo exigente: ${fmt(targetPace100 * 1.10 * 2)}) desc. 30".\n4x100m Técnica ${style} enfocada en el recobro.\n200m Afloje.`,
                        `WARMUP: 600m con paletas.\nMAIN: Series Fraccionadas:\n4x(300m ${style} Ritmo Z3 c/4:30 + 100m fuerte Ritmo Z4 c/1:45).\n12x50m Patada (25m suave/25m explosivo) c/1:10.\n200m Afloje.`,
                        `WARMUP: 400m + 6x50m Aceleraciones.\nMAIN: VO2 Max:\n12x100m ${style} (Ritmo de competencia + 3s: ${fmt(targetPace100 + 3)}) c/2:00.\n400m Pullbuoy suave.`
                    ],
                    'LONG': [
                        `WARMUP: 800m.\nMAIN: Resistencia Específica:\n5x400m Libre (Ritmo Z3 sostenido: ${fmt(currentPace100 * 1.12 * 4)}) desc. 45".\n8x100m ${style} técnica c/15".\n400m Afloje.`,
                        `WARMUP: 600m Mixto.\nMAIN: Bloque Fondo:\n1x800m (Z2) + 1x400m (Z3) + 1x200m (Z4) + 1x100m (MAX).\nDescanso 1 min entre bloques.\n4x100m Patada c/2:00.\n200m Afloje.`,
                        `WARMUP: 1000m (200m nado/50m rápido x 4).\nMAIN: 15x100m Libre (Z3 buscando consistencia: ${pZ3}) c/1:30.\n1x400m Pullbuoy (Z2) constante.\n200m Afloje.`
                    ]
                },
                'Velocidad': {
                    'SPRINT': [
                        `WARMUP: 300m + 4x25m Sprints cortos.\nMAIN: Velocidad Pura (Aláctica):\n3x(4x25m ${style} SPRINT TOTAL c/1:00). 5 min entre series.\nSimulacro: 1x50m ${style} Cronometrado desde el bloque.\n400m Regenerativo.`,
                        `WARMUP: 400m Sensibilidad.\nMAIN: Ritmo Específico:\n6x50m ${style} (Ritmo de carrera: ${racePace}) desc. 3 min.\nFoco en: Frecuencia de brazada y salida subacuática.\n8x25m Virajes y llegadas c/1:00.`,
                        `WARMUP: 200m Nado + 200m Drills.\nMAIN: Explosividad:\n10x25m ${style} (Máximo esfuerzo, mínimo respiraciones) c/1:30.\n4x50m Suave.\n4x15m Salidas explosivas (solo fase subacuática y 4 brazadas).`
                    ],
                    'MID': [
                        `WARMUP: 400m + 4x50m Aceleraciones.\nMAIN: Series Rotas:\n4x(100m ${style} como 50+50 desc. 10", sumando tiempo objetivo: ${racePace}) desc. 5 min.\n6x50m Técnica de ritmo c/1:15.\n200m Afloje.`,
                        `WARMUP: 500m Variado.\nMAIN: Ritmo de Prueba:\n8x100m ${style} (Ritmo de 200m: ${fmt(targetPace100 * 1.02)}) desc. 2 min.\n4x50m Patada fuerte c/1:30.\n300m Afloje.`,
                        `WARMUP: 400m + 8x25m Sprints.\nMAIN: Tolerancia:\n1x200m ${style} al 95%.\n6x50m ${style} (Z4 Ritmo: ${pZ4}) desc. 1 min.\n400m Regenerativo.`
                    ],
                    'LONG': [
                        `WARMUP: 600m.\nMAIN: Ritmo de Fondo:\n3x400m Libre (Ritmo de competencia objetivo: ${fmt(targetPace100 * 4)}) desc. 2 min.\n4x100m ${style} (Fuerte final de prueba) desc. 45".\n400m Afloje.`,
                        `WARMUP: 800m (400m nado/400m drills).\nMAIN: Fraccionado Largo:\n8x200m Libre (Ritmo de 1500m objetivo: ${fmt(targetPace100 * 2)}) c/3:00.\n4x50m Sprint final c/1:30.\n200m Afloje.`,
                        `WARMUP: 500m.\nMAIN: Ritmo y Control:\n1x800m Libre (Ritmo de carrera constante).\n12x50m ${style} (Técnica perfecta con fatiga) c/1:00.\n400m Afloje.`
                    ]
                },
                'Tapering': {
                    'SPRINT': [
                        `WARMUP: 200m Sculling + 200m Nado fluido.\nMAIN: Puesta a Punto:\n4x25m ${style} Ritmo Carrera (${fmt(targetPace100/4)}) c/2:00.\n4 Salidas de bloque completas.\n6 Virajes perfectos.\n200m Relajado.`,
                        `WARMUP: 400m Muy suave.\nMAIN: Sensaciones:\n2x50m ${style} Ritmo Carrera c/4:00.\nFoco 100% en el agarre del agua.\n200m Nado con aletas (suave) para sentir velocidad.`,
                        `WARMUP: 300m Estilos suave.\nMAIN: Activación Silbato:\n8x15m Explosivos desde el agua c/1:30.\n4x25m Suave técnica.\nVisualización en el borde de la piscina.`
                    ],
                    'MID': [
                        `WARMUP: 400m Mixto.\nMAIN: Calibración de Ritmo:\n4x50m ${style} Ritmo Carrera (${racePace}) c/3:00.\n2x100m Muy suave.\nPráctica de virajes específicos de la prueba.\n200m Afloje.`,
                        `WARMUP: 200m Pull + 200m Nado.\nMAIN: Activación Neural:\n1x100m ${style} (Primeros 100m de la prueba a ritmo real).\n4x25m Suave.\n2 Salidas de bloque.\n300m Regenerativo.`,
                        `WARMUP: 400m Suave.\nMAIN: Fluir:\n8x50m (25m Ritmo Carrera/25m Muy Suave) c/2:00.\nEstiramientos dinámicos ligeros en el agua.\n200m Afloje.`
                    ],
                    'LONG': [
                        `WARMUP: 600m Continuo.\nMAIN: Mantenimiento:\n2x200m Libre Ritmo de Carrera c/5:00.\n4x100m Muy suave pullbuoy.\nFoco en relajación de hombros y respiración.\n400m Afloje.`,
                        `WARMUP: 400m variado.\nMAIN: Ritmo Ligero:\n1x400m Libre (Ritmo de competencia relajado).\n4x50m Técnica c/1:00.\n200m Afloje.`,
                        `WARMUP: 500m.\nMAIN: Sensibilidad:\n12x25m (Impares: Sensibilidad / Pares: Ritmo Carrera) c/1:00.\n400m Regenerativo.`
                    ]
                }
            };

            // --- SELECTION LOGIC ---
            if (hasGym) {
                const phaseKey = stage.includes('Base') ? 'Base' : stage.includes('Desarrollo') ? 'Desarrollo' : stage.includes('Velocidad') ? 'Velocidad' : 'Tapering';
                const variants = gymPools[phaseKey];
                gymDesc = variants[seed % variants.length];
            }

            if (hasPool) {
                const phaseKey = stage.includes('Base') ? 'Base' : stage.includes('Desarrollo') ? 'Desarrollo' : stage.includes('Velocidad') ? 'Velocidad' : 'Tapering';
                const variants = poolWorkouts[phaseKey][distCat];
                let rawDesc = variants[seed % variants.length];
                
                // Style specific replacements
                if (style === 'Mariposa') {
                    rawDesc = rawDesc.replace(/Drill/g, 'Drill Mariposa (1 brazo / 2-2-2)');
                    rawDesc = rawDesc.replace(/ técnica /g, ' técnica Mariposa (patada delfín/entrada) ');
                } else if (style === 'Pecho') {
                    rawDesc = rawDesc.replace(/Drill/g, 'Drill Pecho (2 patadas x 1 brazada)');
                    rawDesc = rawDesc.replace(/ técnica /g, ' técnica Pecho (deslizamiento/coordinación) ');
                } else if (style === 'Espalda') {
                    rawDesc = rawDesc.replace(/Drill/g, 'Drill Espalda (rolido/un brazo)');
                    rawDesc = rawDesc.replace(/ técnica /g, ' técnica Espalda (posición cabeza/rotación) ');
                } else if (style === 'Combinado') {
                    rawDesc = rawDesc.replace(/${style}/g, 'Mariposa/Espalda/Pecho/Libre');
                    rawDesc = rawDesc.replace(/ técnica /g, ' técnica de Transiciones ');
                }

                poolDesc = rawDesc;
                intensity = stage.includes('Base') ? 'Media' : stage.includes('Desarrollo') ? 'Media-Alta' : stage.includes('Velocidad') ? 'Alta' : 'Baja-Media';
            } else {
                intensity = 'Descanso';
            }
        }

        workoutCards.gym.style.display = hasGym ? 'flex' : 'none';
        workoutCards.pool.style.display = (hasPool || !hasGym) ? 'flex' : 'none';
        
        if (hasGym) {
            workoutCards.gym.querySelector('h4').textContent = 'Preparación Física (Gym)';
            planGymDesc.textContent = gymDesc;
        }
        
        if (hasPool) {
            workoutCards.pool.querySelector('h4').textContent = 'Entrenamiento en Agua';
            planPoolDesc.textContent = poolDesc;
            workoutCards.pool.style.borderLeftColor = '#0ea5e9';
        } else if (!hasGym) {
            workoutCards.pool.querySelector('h4').textContent = 'Día de Recuperación';
            planPoolDesc.textContent = "• Recuperación pasiva.\n• Hidratación abundante.\n• Visualización de la carrera y trabajo mental.\n• Dormir al menos 8-9 horas.";
            workoutCards.pool.style.borderLeftColor = 'var(--success)';
        }

        // Configuración visual de la etiqueta de intensidad
        planIntensity.textContent = `Intensidad: ${intensity}`;
        const colors = (intensity === 'Alta' || intensity === 'Media-Alta') ? ['#ef4444', 'rgba(239, 68, 68, 0.15)'] : 
                       (intensity === 'Descanso' || intensity === 'Baja') ? ['#10b981', 'rgba(16, 185, 129, 0.15)'] : 
                       ['#f59e0b', 'rgba(245, 158, 11, 0.15)'];
        planIntensity.style.color = colors[0];
        planIntensity.style.background = colors[1];
    }


    function timeToSeconds(s) {
        if (!s) return 0;
        const p = s.split(':'); if (p.length!==2) return 0;
        const [m, sc] = [parseInt(p[0]), p[1].split('.')];
        return (m * 60) + parseInt(sc[0]) + (sc[1] ? parseInt(sc[1])/100 : 0);
    }

    function getLocalIsoDate(d) {
        return new Date(d - d.getTimezoneOffset()*60000).toISOString().split('T')[0];
    }
});
