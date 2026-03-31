document.addEventListener('DOMContentLoaded', () => {
    
    const backBtn = document.getElementById('backBtn');
    backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // 1. Gather Data from LocalStorage
    const keys = Object.keys(localStorage)
        .filter(k => k.startsWith('dailyTracker_'))
        .sort(); // Sorts alphabetically which correctly sorts YYYY-MM-DD

    if (keys.length === 0) {
        // No data yet
        return;
    }

    const labelsDate = [];
    const jointsData = [];
    const workoutsData = [];
    const tasksDoneData = [];
    const incomeData = [];
    const spendData = [];
    
    let totalWorkouts = 0;
    let totalJoints = 0;
    let totalWorkMs = 0;

    keys.forEach(key => {
        const dateStr = key.replace('dailyTracker_', ''); // YYYY-MM-DD
        const dateObj = new Date(dateStr);
        labelsDate.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const dayData = JSON.parse(localStorage.getItem(key));

        // Joints
        jointsData.push(dayData.joints || 0);
        totalJoints += (dayData.joints || 0);

        // Workouts
        const workoutsCount = (dayData.workouts || []).filter(w => w.done).length;
        workoutsData.push(workoutsCount);
        totalWorkouts += workoutsCount;

        // Tasks Done
        const tasksCount = (dayData.tasks || []).filter(t => t.done).length;
        tasksDoneData.push(tasksCount);

        // Work Hours logic
        (dayData.work || []).forEach(w => {
            if (w.start && w.end) {
                // simple time diff
                const startMins = parseTime(w.start);
                const endMins = parseTime(w.end);
                let diffMins = endMins - startMins;
                if (diffMins < 0) diffMins += 24 * 60; // crossed midnight
                totalWorkMs += diffMins * 60 * 1000;
            }
        });

        // Budget
        incomeData.push(parseFloat(dayData.budget?.income) || 0);
        spendData.push(parseFloat(dayData.budget?.spend) || 0);
    });

    // Update Totals
    document.getElementById('totalDaysStat').textContent = keys.length;
    document.getElementById('totalWorkoutsStat').textContent = totalWorkouts;
    document.getElementById('totalJointsStat').textContent = totalJoints;
    document.getElementById('totalWorkHoursStat').textContent = (totalWorkMs / (1000 * 60 * 60)).toFixed(1) + 'h';

    // Chart Options Default
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                border: { display: false }
            },
            x: {
                grid: { display: false },
                border: { display: false }
            }
        }
    };

    // --- Joints Chart (Line) ---
    new Chart(document.getElementById('jointsChart'), {
        type: 'line',
        data: {
            labels: labelsDate,
            datasets: [{
                label: 'Joints',
                data: jointsData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#10b981'
            }]
        },
        options: commonOptions
    });

    // --- Workouts Chart (Bar) ---
    new Chart(document.getElementById('workoutsChart'), {
        type: 'bar',
        data: {
            labels: labelsDate,
            datasets: [{
                label: 'Exercises Done',
                data: workoutsData,
                backgroundColor: '#ef4444',
                borderRadius: 4
            }]
        },
        options: commonOptions
    });

    // --- Tasks Status Chart (Line/Bar) ---
    new Chart(document.getElementById('tasksChart'), {
        type: 'line',
        data: {
            labels: labelsDate,
            datasets: [{
                label: 'Tasks Completed',
                data: tasksDoneData,
                borderColor: '#14b8a6',
                borderWidth: 2,
                tension: 0.3,
                pointBackgroundColor: '#14b8a6'
            }]
        },
        options: commonOptions
    });

    // --- Budget Chart (Bar with 2 datasets) ---
    new Chart(document.getElementById('budgetChart'), {
        type: 'bar',
        data: {
            labels: labelsDate,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Spend',
                    data: spendData,
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }
            ]
        },
        options: {
            ...commonOptions,
            plugins: {
                legend: { display: true, position: 'top', labels: { color: '#94a3b8' } }
            }
        }
    });

});

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}
