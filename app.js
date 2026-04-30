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
            appState = { ...appState, ...planData.plan_data };
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

    function renderDailyPlan(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = d.getDay();
        const todayStr = getLocalIsoDate(new Date());
        
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
            hasGym ? gymDesc = "• Descanso activo. Estiramientos suaves y movilidad articular (15 min).\n• Yoga o Pilates ligero." : null;
            hasPool ? poolDesc = "• Nado suave continuo: 15-20 minutos.\n• Juegos acuáticos o técnica muy relajada.\n• Sin control de tiempos ni ritmos." : null;
            intensity = 'Baja';
        } else {
            // --- GYM WORKOUT LOGIC ---
            if (hasGym) {
                if (stage.includes('Base')) {
                    gymDesc = `OBJETIVO: Adaptación Anatómica e Hipertrofia (Core y Estabilidad)\n\n• Calentamiento: 10 min movilidad articular + activación con bandas.\n• Circuito de Fuerza Base (3 series x 15 reps, descanso 45s):\n   - Sentadilla Goblet o Prensa\n   - Dominadas asistidas o Jalón al pecho\n   - Flexiones de pecho (Push-ups)\n   - Remo con mancuerna a una mano\n• Core: Plancha frontal 3x1min + Superman 3x15.\n• Estiramiento pasivo 10 min.`;
                } else if (stage.includes('Desarrollo')) {
                    gymDesc = `OBJETIVO: Fuerza Máxima y Potencia Temprana\n\n• Calentamiento: 15 min dinámico + activación neuromuscular.\n• Bloque Principal (4 series x 6-8 reps, peso alto, descanso 2-3 min):\n   - Sentadilla trasera con barra\n   - Press de banca (o press con mancuernas)\n   - Peso muerto rumano\n   - Remo con barra o dominadas lastradas\n• Trabajo Compensatorio: Rotadores externos con banda 3x12.\n• Core: Rueda abdominal (Ab wheel) 3x10.\n• Vuelta a la calma: Uso de Foam Roller.`;
                } else if (stage.includes('Velocidad')) {
                    if (distCat === 'SPRINT') {
                        gymDesc = `OBJETIVO: Potencia Explosiva y Pliometría (SPRINT)\n\n• Calentamiento: Movilidad + Saltos suaves.\n• Pliometría y Explosividad (5 series x 3-5 reps, máxima velocidad, descanso 3 min):\n   - Saltos al cajón (Box Jumps) altísimos\n   - Lanzamiento de balón medicinal (Slam Ball)\n   - Press de banca pliométrico (o flexiones con palmada)\n   - Power Clean o Cargadas de potencia\n• Core: Lanzamientos rotacionales con balón 3x8/lado.\n• Cero fatiga acumulada, foco en la velocidad de ejecución.`;
                    } else {
                        gymDesc = `OBJETIVO: Mantenimiento de Fuerza y Potencia Resistida\n\n• Calentamiento: Movilidad articular completa.\n• Circuito de Potencia (3 series x 8-10 reps explosivas):\n   - Saltos desde sentadilla (Squat Jumps)\n   - Dominadas explosivas (fase concéntrica rápida)\n   - Press militar con mancuernas\n   - Remo invertido TRX\n• Core: Plancha lateral con rotación 3x12/lado.`;
                    }
                } else if (stage.includes('Tapering')) {
                    gymDesc = `OBJETIVO: Activación Neural y Descarga\n\n• Sesión muy corta y ligera (máx 30 min).\n• Movilidad dinámica y liberación miofascial.\n• 3x5 repeticiones de peso corporal (saltos suaves, flexiones) solo para 'despertar' el músculo.\n• ESTRICTAMENTE PROHIBIDO LLEGAR AL FALLO MUSCULAR.`;
                }
            }

            // --- POOL WORKOUT LOGIC ---
            if (hasPool) {
                // Calcular ritmos exactos basados en el tiempo objetivo
                const targetSecs = timeToSeconds(appState.targetTime) || (distance * 1); // fallback
                const targetPace100 = (targetSecs / distance) * 100;
                
                // Formateador sin centésimas para ritmos de entrenamiento (ej: 1:15)
                const fmt = (s) => {
                    const m = Math.floor(s / 60);
                    const sec = Math.floor(s % 60);
                    return `${m}:${sec.toString().padStart(2, '0')}`;
                };

                const paceZ2 = fmt(targetPace100 * 1.20);
                const paceZ3 = fmt(targetPace100 * 1.10);
                const paceZ4 = fmt(targetPace100 * 1.05);
                const racePace = fmt(targetPace100);
                const racePace50 = fmt(targetPace100 / 2);

                let warmup = "";
                let mainSet = "";
                let cooldown = "• 200m a 400m Afloje (estilo Libre o Espalda relajado).\n• Estiramiento estático fuera del agua (10 min).";

                if (stage.includes('Base')) {
                    intensity = 'Media';
                    warmup = `• 400m Libre nado continuo.\n• 4x100m Estilos (25m patada/25m técnica/50m nado) desc. 15".`;
                    if (distCat === 'SPRINT') {
                        mainSet = `• 10 x 50m ${style} (Foco en técnica perfecta y alcance) c/ 1:00\n• 4 x 200m Libre (Z2 - Objetivo: ${fmt(targetPace100 * 1.20 * 2)}) c/ 3:30\n• 8 x 25m ${style} (Sprint resistido con paracaídas o elástico) desc. 45"`;
                    } else if (distCat === 'MID') {
                        mainSet = `• 3 x (4 x 100m ${style} en Z2 - Ritmo: ${paceZ2} c/ 1:30 + 200m Combinado técnica c/ 3:30)\n• 400m Pullbuoy y paletas (Foco en tracción).`;
                    } else {
                        mainSet = `• 1 x 800m Libre (Z2) ritmo constante a ${paceZ2} c/100m.\n• 4 x 400m Libre (Paletas y Pull) desc. 30" (Trabajo de fuerza aeróbica).\n• 8 x 100m ${style} (Z2 alto - Ritmo: ${fmt(targetPace100 * 1.15)}) c/ 1:20.`;
                    }
                } else if (stage.includes('Desarrollo')) {
                    intensity = 'Media-Alta';
                    warmup = `• 300m Libre + 200m Pull + 4x50m Aceleraciones progresivas.`;
                    if (distCat === 'SPRINT') {
                        mainSet = `• Tolerancia al Lactato:\n   - 4 x 50m ${style} (A TOPE, Ritmo de carrera objetivo: ${racePace50}) desc. 2 minutos.\n   - 200m afloje activo.\n   - 6 x 25m ${style} Salidas desde el bloque, máxima explosividad.\n• 400m Trabajo de técnica con aletas.`;
                    } else if (distCat === 'MID') {
                        mainSet = `• VO2 Max / Umbral Anaeróbico:\n   - 8 x 100m ${style} (Z4 - Ritmo exigente: ${paceZ4}) desc. 30".\n   - 100m afloje.\n   - 4 x 200m Libre (Z3 - Ritmo sostenido: ${fmt(targetPace100 * 1.10 * 2)}) desc. 45".`;
                    } else {
                        mainSet = `• Trabajo de Umbral (Paso de carrera):\n   - 15 x 100m Libre (En Z3, buscando clavar el ritmo: ${paceZ3}) desc. solo 15".\n   - 200m afloje suave.\n   - 5 x 200m ${style} (Paletas, ritmo constante) desc. 30".`;
                    }
                } else if (stage.includes('Velocidad')) {
                    intensity = 'Alta';
                    warmup = `• 200m Nado + 4x50m Técnica + 4x25m Sprints cortos (15m a tope).`;
                    if (distCat === 'SPRINT') {
                        mainSet = `• Velocidad Pura (Aláctica) y Ritmo:\n   - 3 x (4 x 25m ${style} SPRINT TOTAL sin respirar, apuntando a ${fmt(targetPace100 / 4)} desc. 1 min entre 25s, 3 min entre series).\n   - Simulacro: 1 x 50m ${style} cronometrado desde el bloque (Ritmo de competencia: ${racePace50}).\n   - 200m Recuperación activa muy suave.`;
                    } else if (distCat === 'MID') {
                        mainSet = `• Ritmo Específico de Prueba:\n   - Series rotas: 4 x (100m ${style} dividido en 50+50 desc. 10", sumar el tiempo objetivo de competencia: ${racePace}) desc. 2 min entre bloques.\n   - 6 x 50m (Ritmo ligeramente superior a la prueba: ${fmt((targetPace100 / 2) * 0.98)}) desc. 45".`;
                    } else {
                        mainSet = `• Ritmo de Mantenimiento y Cierre:\n   - 3 x 400m Libre (Ritmo de competencia para el fondo, clavando ${racePace} cada 100m) desc. 45".\n   - 4 x 100m ${style} (Simulando los últimos 100m de la prueba, muy fuerte con fatiga: ${paceZ4}) desc. 30".`;
                    }
                } else if (stage.includes('Tapering')) {
                    intensity = 'Baja-Media';
                    warmup = `• 200m Sensibilidad (Sculling) + 200m Nado perfecto y fluido.`;
                    mainSet = `• Puesta a Punto:\n   - Volumen reducido un 50%. Foco 100% en cómo se siente el agua (Agarrar agua).\n   - 4 x 25m ${style} a Ritmo de Carrera perfecto (${fmt(targetPace100 / 4)}). Mucha recuperación.\n   - 4 Salidas desde el bloque, practicando la reacción al silbato, fase subacuática y primera brazada.\n   - Práctica de 6 Virajes (Llegada rápida, giro compacto, salida explosiva).`;
                }
                
                // Limpieza de estilo para Combinado
                if (style === 'Combinado') {
                    mainSet = mainSet.replace(/Combinado/g, 'Mariposa/Espalda/Pecho/Libre');
                }

                poolDesc = `ENTRADA EN CALOR:\n${warmup}\n\nBLOQUE PRINCIPAL:\n${mainSet}\n\nRECUPERACIÓN:\n${cooldown}`;
            } else {
                intensity = 'Descanso';
            }
        }

        workoutCards.gym.style.display = hasGym ? 'flex' : 'none';
        workoutCards.pool.style.display = hasPool ? 'flex' : 'none';
        
        if (hasGym) {
            workoutCards.gym.querySelector('h4').textContent = 'Preparación Física (Gym)';
            planGymDesc.textContent = gymDesc;
        }
        
        if (hasPool) {
            workoutCards.pool.querySelector('h4').textContent = 'Entrenamiento en Agua';
            planPoolDesc.textContent = poolDesc;
            workoutCards.pool.style.borderLeftColor = '#0ea5e9';
        } else if (!hasGym) {
            workoutCards.pool.style.display = 'flex';
            workoutCards.pool.querySelector('h4').textContent = 'Día de Recuperación';
            planPoolDesc.textContent = "• Recuperación pasiva.\n• Hidratación abundante.\n• Visualización de la carrera y trabajo mental.";
            workoutCards.pool.style.borderLeftColor = 'var(--success)';
        }

        // Configuración visual de la etiqueta de intensidad
        planIntensity.textContent = `Intensidad: ${intensity}`;
        const colors = intensity === 'Alta' || intensity === 'Media-Alta' ? ['#ef4444', 'rgba(239, 68, 68, 0.15)'] : 
                       intensity === 'Descanso' || intensity === 'Baja' ? ['var(--success)', 'rgba(16, 185, 129, 0.15)'] : 
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
