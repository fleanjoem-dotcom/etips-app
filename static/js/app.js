// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then(registration => console.log('SW registered:', registration))
            .catch(error => console.log('SW registration failed:', error));
    });
}

// Global variables
let earthquakes = [];
let alerts = [];
let map = null;
let mapHome = null; // Separate map for home page
// Tupi, South Cotabato coordinates (NOT Davao)
let userLocation = { lat: 6.3167, lng: 124.9500 }; // Tupi town proper

// Community data
let communityData = {
    safetyTips: [],
    reminders: [],
    drillTutorials: [],
    emergencyKit: []
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initLandingAnimation();
    loadEarthquakes(); // This will call initMapHome() after earthquakes are loaded
    loadAlerts();
    getUserLocation();
    loadCommunityData();
    // Map will be initialized by loadEarthquakes() after data is ready
});

// Landing page animations
function initLandingAnimation() {
    const title = document.querySelector('.hero-title');
    if (title) {
        gsap.fromTo('.hero-title', 
            { y: 100, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: 'back.out(1.7)', delay: 0.2 }
        );
        gsap.fromTo('.hero-image-container',
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.3 }
        );
        gsap.fromTo('.btn-primary',
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)', delay: 0.8 }
        );
        gsap.fromTo('.floating-icon',
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'back.out(2)', delay: 0.5 }
        );
    }
}

// View management
function showView(viewName) {
    // Hide all views
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('home-page').classList.add('hidden');
    document.getElementById('guides-page').classList.add('hidden');
    document.getElementById('alerts-page').classList.add('hidden');
    document.getElementById('community-page').classList.add('hidden');
    document.getElementById('map-page').classList.add('hidden');
    
    // Show selected view
    if (viewName === 'home') {
        document.getElementById('home-page').classList.remove('hidden');
        updateNavigation('home');
        // Reinitialize home map when returning to home
        setTimeout(() => {
            if (mapHome) {
                mapHome.invalidateSize();
            } else if (earthquakes.length > 0) {
                // Only initialize if earthquakes are loaded
                initMapHome();
            }
        }, 100);
    } else if (viewName === 'guides') {
        document.getElementById('guides-page').classList.remove('hidden');
        updateNavigation('guides');
    } else if (viewName === 'alerts') {
        document.getElementById('alerts-page').classList.remove('hidden');
        updateNavigation('alerts');
        // Render alert notifications (warnings, not past earthquakes)
        renderAlerts();
    } else if (viewName === 'community') {
        document.getElementById('community-page').classList.remove('hidden');
        updateNavigation('community');
    } else if (viewName === 'map') {
        // Map is now on home page, redirect to home
        showView('home');
        // Scroll to map section
        setTimeout(() => {
            const mapSection = document.querySelector('.map-container-home');
            if (mapSection) {
                mapSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);
        return;
    }
    
    // Animate view transition
    gsap.fromTo('.app-container:not(.hidden)',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
    );
}

// Toggle Guide Card Expansion
function toggleGuideCard(guideId) {
    const content = document.getElementById(guideId);
    const icon = document.getElementById(`icon-${guideId}`);
    
    if (content.style.display === 'none' || content.style.display === '') {
        // Collapse all other guides first
        document.querySelectorAll('.guide-content').forEach(guide => {
            if (guide.id !== guideId) {
                guide.style.display = 'none';
            }
        });
        document.querySelectorAll('.expand-icon-guide').forEach(i => {
            if (i.id !== `icon-${guideId}`) {
                i.style.transform = 'rotate(0deg)';
            }
        });
        
        // Expand this guide
        content.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        
        // Animate expansion
        if (typeof gsap !== 'undefined') {
            gsap.fromTo(content, 
                { opacity: 0, height: 0 },
                { opacity: 1, height: 'auto', duration: 0.4, ease: 'power2.out' }
            );
        }
    } else {
        // Collapse this guide
        if (typeof gsap !== 'undefined') {
            gsap.to(content, {
                opacity: 0,
                height: 0,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => {
                    content.style.display = 'none';
                    icon.style.transform = 'rotate(0deg)';
                }
            });
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    }
}

function updateNavigation(activeView) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const navItems = document.querySelectorAll('.nav-item');
    const viewMap = { 'home': 0, 'guides': 1, 'alerts': 2, 'community': 3 }; // Map removed
    if (viewMap[activeView] !== undefined) {
        navItems[viewMap[activeView]].classList.add('active');
    }
}

// Load earthquakes
async function loadEarthquakes() {
    try {
        const response = await fetch('/api/earthquakes');
        earthquakes = await response.json();
        
        console.log('Earthquakes loaded:', earthquakes.length);
        document.getElementById('earthquake-count').textContent = earthquakes.length;
        renderEarthquakes();
        
        // Initialize home map AFTER earthquakes are loaded
        if (document.getElementById('map-home')) {
            initMapHome();
        }
    } catch (error) {
        console.error('Error loading earthquakes:', error);
    }
}

// Show all earthquakes in modal
function showAllEarthquakes() {
    const modal = document.getElementById('all-earthquakes-modal');
    const content = document.getElementById('all-earthquakes-content');
    
    if (!modal || !content) {
        console.error('Modal elements not found');
        return;
    }
    
    let earthquakesHTML = '';
    earthquakes.forEach((quake, index) => {
        const riskClass = quake.riskLevel === 'high' ? 'risk-high' : 
                         quake.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';
        const bgColor = quake.riskLevel === 'high' ? 'rgba(230, 57, 70, 0.1)' :
                       quake.riskLevel === 'medium' ? 'rgba(252, 191, 73, 0.1)' : 'rgba(42, 157, 143, 0.1)';
        const textColor = quake.riskLevel === 'high' ? '#e63946' :
                         quake.riskLevel === 'medium' ? '#fcbf49' : '#2a9d8f';
        
        earthquakesHTML += `
            <div class="earthquake-card" style="margin-bottom: 0.75rem; animation: slideIn 0.3s ease ${index * 0.1}s both;">
                <div class="magnitude-badge" style="background-color: ${bgColor};">
                    <span class="magnitude-value" style="color: ${textColor};">${quake.magnitude}</span>
                    <span class="magnitude-label">Mag</span>
                </div>
                <div class="earthquake-info">
                    <h3 class="earthquake-location">${quake.location}</h3>
                    <div class="earthquake-meta">
                        <span class="meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                            </svg>
                            ${quake.distance.toFixed(1)}km away
                        </span>
                        <span class="meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${formatTime(quake.timestamp)}
                        </span>
                    </div>
                    <div style="margin-top: 0.5rem; font-size: 0.75rem; color: rgba(255,255,255,0.6);">
                        Depth: ${quake.depth}km • Coordinates: ${quake.coordinates[0].toFixed(4)}, ${quake.coordinates[1].toFixed(4)}
                    </div>
                </div>
                <div class="risk-badge ${riskClass}">
                    ${quake.riskLevel.charAt(0).toUpperCase() + quake.riskLevel.slice(1)}
                </div>
            </div>
        `;
    });
    
    content.innerHTML = earthquakesHTML;
    modal.classList.remove('hidden');
    
    // Add animation
    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#all-earthquakes-modal .modal-content',
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }
}

function closeAllEarthquakesModal() {
    const modal = document.getElementById('all-earthquakes-modal');
    if (!modal) return;
    
    if (typeof gsap !== 'undefined') {
        gsap.to('#all-earthquakes-modal .modal-content', {
            scale: 0.8,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => modal.classList.add('hidden')
        });
    } else {
        modal.classList.add('hidden');
    }
}

function renderEarthquakes() {
    const container = document.getElementById('earthquake-list');
    container.innerHTML = '';
    
    // Create a wrapper for compact view
    const wrapper = document.createElement('div');
    wrapper.id = 'earthquake-wrapper';
    
    // Show only first 3 earthquakes initially
    const initialLimit = 3;
    let showingAll = false;
    
    function renderQuakeCards(limit = null) {
        wrapper.innerHTML = '';
        const quakesToShow = limit ? earthquakes.slice(0, limit) : earthquakes;
        
        quakesToShow.forEach((quake, index) => {
            const card = document.createElement('div');
            card.className = 'earthquake-card';
            card.style.cursor = 'pointer';
            card.style.position = 'relative';
            
            const riskClass = quake.riskLevel === 'high' ? 'risk-high' : 
                             quake.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';
            const bgColor = quake.riskLevel === 'high' ? 'rgba(230, 57, 70, 0.1)' :
                           quake.riskLevel === 'medium' ? 'rgba(252, 191, 73, 0.1)' : 'rgba(42, 157, 143, 0.1)';
            const textColor = quake.riskLevel === 'high' ? '#e63946' :
                             quake.riskLevel === 'medium' ? '#fcbf49' : '#2a9d8f';
            
            card.innerHTML = `
                <div class="magnitude-badge" style="background-color: ${bgColor};">
                    <span class="magnitude-value" style="color: ${textColor};">${quake.magnitude}</span>
                    <span class="magnitude-label">Mag</span>
                </div>
                <div class="earthquake-info" style="flex: 1;">
                    <h3 class="earthquake-location">${quake.location}</h3>
                    <div class="earthquake-meta">
                        <span class="meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                            </svg>
                            ${quake.distance.toFixed(1)}km away
                        </span>
                        <span class="meta-item">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            ${formatTime(quake.timestamp)}
                        </span>
                    </div>
                    
                    <!-- Expandable Details Section -->
                    <div class="earthquake-details" id="details-${quake.id}" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; margin-bottom: 0.25rem;">Depth</p>
                                <p style="color: white; font-weight: 600; font-size: 0.9375rem;">${quake.depth}km</p>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; margin-bottom: 0.25rem;">Coordinates</p>
                                <p style="color: white; font-weight: 600; font-size: 0.875rem;">${quake.coordinates[0].toFixed(2)}, ${quake.coordinates[1].toFixed(2)}</p>
                            </div>
                        </div>
                        
                        <!-- AI Risk Assessment Button Inside Card -->
                        <button class="ai-assessment-btn-card" onclick="event.stopPropagation(); performRiskAssessmentForQuake('${quake.id}')" style="width: 100%; background: linear-gradient(135deg, var(--etips-orange), var(--etips-red)); color: white; padding: 0.875rem; border-radius: 0.5rem; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(247, 127, 0, 0.3);">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                            <span>🤖 Analyze This Earthquake</span>
                        </button>
                    </div>
                </div>
                <div class="risk-badge ${riskClass}">
                    ${quake.riskLevel.charAt(0).toUpperCase() + quake.riskLevel.slice(1)}
                </div>
                
                <!-- Expand/Collapse Icon -->
                <div class="expand-icon" id="icon-${quake.id}" style="position: absolute; bottom: 0.75rem; right: 0.75rem; color: rgba(255,255,255,0.5); transition: transform 0.3s ease;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            `;
            
            // Make card clickable to expand/collapse
            card.addEventListener('click', (e) => {
                // Don't toggle if clicking the AI button
                if (e.target.closest('.ai-assessment-btn-card')) return;
                
                const details = document.getElementById(`details-${quake.id}`);
                const icon = document.getElementById(`icon-${quake.id}`);
                
                if (details.style.display === 'none') {
                    // Collapse all other cards first
                    document.querySelectorAll('.earthquake-details').forEach(d => d.style.display = 'none');
                    document.querySelectorAll('.expand-icon').forEach(i => i.style.transform = 'rotate(0deg)');
                    
                    // Expand this card
                    details.style.display = 'block';
                    icon.style.transform = 'rotate(180deg)';
                    
                    // Animate expansion
                    if (typeof gsap !== 'undefined') {
                        gsap.fromTo(details, 
                            { opacity: 0, height: 0 },
                            { opacity: 1, height: 'auto', duration: 0.3, ease: 'power2.out' }
                        );
                    }
                } else {
                    // Collapse this card
                    if (typeof gsap !== 'undefined') {
                        gsap.to(details, {
                            opacity: 0,
                            height: 0,
                            duration: 0.3,
                            ease: 'power2.in',
                            onComplete: () => {
                                details.style.display = 'none';
                                icon.style.transform = 'rotate(0deg)';
                            }
                        });
                    } else {
                        details.style.display = 'none';
                        icon.style.transform = 'rotate(0deg)';
                    }
                }
            });
            
            wrapper.appendChild(card);
        });
        
        // Add "View All" or "Show Less" button if there are more earthquakes
        if (earthquakes.length > initialLimit) {
            const toggleBtn = document.createElement('button');
            toggleBtn.style.cssText = `
                width: 100%;
                background: linear-gradient(135deg, rgba(247, 127, 0, 0.2), rgba(230, 57, 70, 0.2));
                border: 1px solid rgba(247, 127, 0, 0.3);
                color: white;
                padding: 0.875rem;
                border-radius: 0.75rem;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                transition: all 0.3s ease;
                margin-top: 1rem;
            `;
            
            if (!showingAll) {
                toggleBtn.innerHTML = `
                    <span>View All ${earthquakes.length} Earthquakes</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;
            } else {
                toggleBtn.innerHTML = `
                    <span>Show Less</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                `;
            }
            
            toggleBtn.addEventListener('mouseenter', () => {
                toggleBtn.style.background = 'linear-gradient(135deg, rgba(247, 127, 0, 0.3), rgba(230, 57, 70, 0.3))';
                toggleBtn.style.borderColor = 'rgba(247, 127, 0, 0.5)';
                toggleBtn.style.transform = 'translateY(-2px)';
                toggleBtn.style.boxShadow = '0 4px 20px rgba(247, 127, 0, 0.3)';
            });
            
            toggleBtn.addEventListener('mouseleave', () => {
                toggleBtn.style.background = 'linear-gradient(135deg, rgba(247, 127, 0, 0.2), rgba(230, 57, 70, 0.2))';
                toggleBtn.style.borderColor = 'rgba(247, 127, 0, 0.3)';
                toggleBtn.style.transform = 'translateY(0)';
                toggleBtn.style.boxShadow = 'none';
            });
            
            toggleBtn.addEventListener('click', () => {
                showingAll = !showingAll;
                renderQuakeCards(showingAll ? null : initialLimit);
                
                // Animate
                if (typeof gsap !== 'undefined') {
                    gsap.fromTo(wrapper.children, 
                        { opacity: 0, y: 20 },
                        { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }
                    );
                }
            });
            
            wrapper.appendChild(toggleBtn);
        }
    }
    
    // Initial render with limit
    renderQuakeCards(initialLimit);
    container.appendChild(wrapper);
}

// Render Alert Notifications (warnings, not past earthquakes)
function renderAlerts() {
    const container = document.getElementById('alerts-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Generate alerts based on recent earthquake data
    const generatedAlerts = generateAlertsFromEarthquakes();
    
    if (generatedAlerts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; background: rgba(42, 157, 143, 0.1); border-radius: 1rem; border: 2px solid rgba(42, 157, 143, 0.3);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
                <h3 style="color: white; font-weight: 700; font-size: 1.25rem; margin-bottom: 0.5rem;">All Clear</h3>
                <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem;">No active warnings or alerts at this time. Stay prepared!</p>
            </div>
        `;
        return;
    }
    
    generatedAlerts.forEach((alert, index) => {
        const card = document.createElement('div');
        card.className = 'earthquake-card';
        card.style.cursor = 'pointer';
        card.style.position = 'relative';
        card.style.marginBottom = '1rem';
        
        // Determine colors based on severity
        let borderColor, badgeBg, badgeColor, iconColor;
        if (alert.severity === 'critical' || alert.severity === 'high') {
            borderColor = '#e63946';
            badgeBg = '#e63946';
            badgeColor = 'white';
            iconColor = '#e63946';
        } else if (alert.severity === 'medium' || alert.severity === 'warning') {
            borderColor = '#fcbf49';
            badgeBg = '#fcbf49';
            badgeColor = '#1a1a1a';
            iconColor = '#fcbf49';
        } else if (alert.severity === 'info') {
            borderColor = '#457b9d';
            badgeBg = '#457b9d';
            badgeColor = 'white';
            iconColor = '#457b9d';
        } else {
            borderColor = '#2a9d8f';
            badgeBg = '#2a9d8f';
            badgeColor = 'white';
            iconColor = '#2a9d8f';
        }
        
        card.style.borderLeft = `4px solid ${borderColor}`;
        
        // Get appropriate icon based on alert type
        let iconSvg = '';
        if (alert.type === 'earthquake') {
            iconSvg = `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>`;
        } else if (alert.type === 'aftershock') {
            iconSvg = `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>`;
        } else if (alert.type === 'evacuation') {
            iconSvg = `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>`;
        } else if (alert.type === 'tsunami') {
            iconSvg = `<path d="M2 12h20"></path><path d="M2 12c0 5.5 4.5 10 10 10s10-4.5 10-10"></path>`;
        } else {
            iconSvg = `<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>`;
        }
        
        card.innerHTML = `
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">${alert.severity}</span>
                    <span style="color: rgba(255,255,255,0.5); font-size: 0.75rem;">${formatTime(alert.timestamp)}</span>
                </div>
                
                <div style="display: flex; align-items: start; gap: 1rem;">
                    <div style="width: 3rem; height: 3rem; background: rgba(${alert.severity === 'critical' || alert.severity === 'high' ? '230, 57, 70' : alert.severity === 'medium' || alert.severity === 'warning' ? '252, 191, 73' : alert.severity === 'info' ? '69, 123, 157' : '42, 157, 143'}, 0.2); border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2">
                            ${iconSvg}
                        </svg>
                    </div>
                    <div style="flex: 1;">
                        <h3 style="color: white; font-weight: 600; margin-bottom: 0.5rem; font-size: 1rem;">${alert.title}</h3>
                        <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; line-height: 1.5; margin-bottom: 0.5rem;">${alert.message}</p>
                        ${alert.location ? `<p style="color: rgba(255,255,255,0.5); font-size: 0.75rem;">📍 ${alert.location}</p>` : ''}
                    </div>
                </div>
                
                <!-- Expandable AI Analysis Section -->
                <div class="alert-details" id="alert-details-${alert.id}" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                    ${alert.earthquakeData ? `
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; margin-bottom: 0.25rem;">Magnitude</p>
                                <p style="color: white; font-weight: 600; font-size: 0.9375rem;">${alert.earthquakeData.magnitude}</p>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; margin-bottom: 0.25rem;">Distance</p>
                                <p style="color: white; font-weight: 600; font-size: 0.9375rem;">${alert.earthquakeData.distance.toFixed(1)} km</p>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; margin-bottom: 0.25rem;">Depth</p>
                                <p style="color: white; font-weight: 600; font-size: 0.9375rem;">${alert.earthquakeData.depth} km</p>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; margin-bottom: 0.25rem;">Risk Level</p>
                                <p style="color: white; font-weight: 600; font-size: 0.9375rem; text-transform: capitalize;">${alert.earthquakeData.riskLevel}</p>
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- AI Risk Assessment Button -->
                    <button class="ai-assessment-btn-card" onclick="event.stopPropagation(); performRiskAssessment()" style="width: 100%; background: linear-gradient(135deg, var(--etips-orange), var(--etips-red)); color: white; padding: 0.875rem; border-radius: 0.5rem; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(247, 127, 0, 0.3);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        <span>🤖 AI Risk Analysis for Your Area</span>
                    </button>
                </div>
            </div>
            
            <!-- Expand/Collapse Icon -->
            <div class="expand-icon" id="alert-icon-${alert.id}" style="position: absolute; bottom: 0.75rem; right: 0.75rem; color: rgba(255,255,255,0.5); transition: transform 0.3s ease;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        `;
        
        // Make card clickable to expand/collapse
        card.addEventListener('click', (e) => {
            // Don't toggle if clicking the AI button
            if (e.target.closest('.ai-assessment-btn-card')) return;
            
            const details = document.getElementById(`alert-details-${alert.id}`);
            const icon = document.getElementById(`alert-icon-${alert.id}`);
            
            if (details.style.display === 'none') {
                // Collapse all other cards first
                document.querySelectorAll('.alert-details').forEach(d => d.style.display = 'none');
                document.querySelectorAll('.expand-icon').forEach(i => i.style.transform = 'rotate(0deg)');
                
                // Expand this card
                details.style.display = 'block';
                icon.style.transform = 'rotate(180deg)';
                
                // Animate expansion
                if (typeof gsap !== 'undefined') {
                    gsap.fromTo(details, 
                        { opacity: 0, height: 0 },
                        { opacity: 1, height: 'auto', duration: 0.3, ease: 'power2.out' }
                    );
                }
            } else {
                // Collapse this card
                if (typeof gsap !== 'undefined') {
                    gsap.to(details, {
                        opacity: 0,
                        height: 0,
                        duration: 0.3,
                        ease: 'power2.in',
                        onComplete: () => {
                            details.style.display = 'none';
                            icon.style.transform = 'rotate(0deg)';
                        }
                    });
                } else {
                    details.style.display = 'none';
                    icon.style.transform = 'rotate(0deg)';
                }
            }
        });
        
        container.appendChild(card);
    });
}

// Generate alert notifications from earthquake data
function generateAlertsFromEarthquakes() {
    const alerts = [];
    const now = new Date();
    
    earthquakes.forEach((quake, index) => {
        const quakeTime = new Date(quake.timestamp);
        const hoursAgo = (now - quakeTime) / (1000 * 60 * 60);
        
        // Only create alerts for recent earthquakes (within last 24 hours)
        if (hoursAgo > 24) return;
        
        // 1. Earthquake Detection Alert (for high magnitude or close distance)
        if (quake.magnitude >= 4.0 || quake.distance < 10) {
            alerts.push({
                id: `eq-${quake.id}`,
                type: 'earthquake',
                severity: quake.riskLevel === 'high' ? 'critical' : quake.riskLevel === 'medium' ? 'warning' : 'info',
                title: `${quake.magnitude >= 5.0 ? 'Strong' : quake.magnitude >= 4.0 ? 'Moderate' : 'Minor'} Earthquake Detected`,
                message: `Magnitude ${quake.magnitude} earthquake detected ${quake.distance.toFixed(1)}km from your location at ${quake.location}. ${quake.magnitude >= 4.5 ? 'Drop, Cover, and Hold On!' : 'Stay alert and be prepared.'}`,
                timestamp: quake.timestamp,
                location: quake.location,
                earthquakeData: quake
            });
        }
        
        // 2. Aftershock Warning (for earthquakes M4.0+ within last 12 hours)
        if (quake.magnitude >= 4.0 && hoursAgo < 12) {
            alerts.push({
                id: `aftershock-${quake.id}`,
                type: 'aftershock',
                severity: 'warning',
                title: 'Aftershock Warning',
                message: `Following the M${quake.magnitude} earthquake at ${quake.location}, aftershocks may occur in the next 24-48 hours. Stay alert, keep emergency supplies ready, and be prepared to Drop, Cover, and Hold On.`,
                timestamp: new Date(quakeTime.getTime() + 15 * 60000).toISOString(), // 15 min after quake
                location: quake.location,
                earthquakeData: quake
            });
        }
        
        // 3. Evacuation Center Notice (for high-risk earthquakes)
        if (quake.riskLevel === 'high' && hoursAgo < 6) {
            alerts.push({
                id: `evac-${quake.id}`,
                type: 'evacuation',
                severity: 'info',
                title: 'Evacuation Centers Available',
                message: `Following the recent earthquake, evacuation centers are now open. Tupi Municipal Gymnasium and Barangay Hall are providing shelter, food, water, and medical assistance.`,
                timestamp: new Date(quakeTime.getTime() + 30 * 60000).toISOString(), // 30 min after quake
                location: 'Tupi Municipal Gymnasium, Barangay Hall',
                earthquakeData: quake
            });
        }
    });
    
    // 4. Add general preparedness alert if no recent earthquakes
    if (alerts.length === 0 && earthquakes.length > 0) {
        const oldestQuake = earthquakes[earthquakes.length - 1];
        alerts.push({
            id: 'preparedness-1',
            type: 'info',
            severity: 'info',
            title: 'Stay Prepared',
            message: 'No immediate threats detected. Continue to maintain your emergency preparedness. Review your emergency kit, practice Drop-Cover-Hold On, and stay informed through E-TIPS.',
            timestamp: new Date().toISOString(),
            location: null,
            earthquakeData: null
        });
    }
    
    // Sort alerts by timestamp (newest first)
    alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return alerts;
}

// AI Risk Assessment for specific earthquake
async function performRiskAssessmentForQuake(quakeId) {
    // Find the specific earthquake
    const quake = earthquakes.find(q => q.id === quakeId);
    if (!quake) return;
    
    // Show loading modal with animation
    const loadingModal = document.getElementById('loading-modal');
    loadingModal.classList.remove('hidden');
    
    // Update loading text to show it's analyzing this specific earthquake
    const loadingText = loadingModal.querySelector('.loading-text');
    const loadingTitle = loadingModal.querySelector('.loading-title');
    loadingTitle.textContent = 'Analyzing Earthquake...';
    loadingText.textContent = `Our AI is analyzing the M${quake.magnitude} earthquake at ${quake.location} (${quake.distance.toFixed(1)}km away) to assess risk levels.`;
    
    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#loading-modal .modal-content',
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }
    
    try {
        const response = await fetch('/api/risk-assessment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userLocation)
        });
        
        const assessment = await response.json();
        
        // Hide loading modal after 2.5 seconds with animation
        setTimeout(() => {
            if (typeof gsap !== 'undefined') {
                gsap.to('#loading-modal .modal-content', {
                    scale: 0.8,
                    opacity: 0,
                    duration: 0.3,
                    ease: 'power2.in',
                    onComplete: () => {
                        loadingModal.classList.add('hidden');
                        showRiskAssessment(assessment);
                    }
                });
            } else {
                loadingModal.classList.add('hidden');
                showRiskAssessment(assessment);
            }
        }, 2500);
    } catch (error) {
        console.error('Error performing risk assessment:', error);
        loadingModal.classList.add('hidden');
    }
}

// Load alerts
async function loadAlerts() {
    try {
        const response = await fetch('/api/alerts');
        alerts = await response.json();
        
        const unreadCount = alerts.filter(a => !a.isRead).length;
        const badge = document.getElementById('notification-count');
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}

// Get user location
function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log('GPS location:', userLocation);
            },
            (error) => {
                console.log('Using Tupi, South Cotabato default location');
                // Tupi, South Cotabato (NOT Davao)
                userLocation = { lat: 6.3167, lng: 124.9500 };
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        // Tupi, South Cotabato default
        userLocation = { lat: 6.3167, lng: 124.9500 };
    }
}

// Format time
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
}

// Show Earthquake Detail with AI Assessment
function showEarthquakeDetail(quake) {
    const modal = document.getElementById('earthquake-detail-modal');
    const content = document.getElementById('earthquake-detail-content');
    
    if (!modal || !content) {
        console.error('Earthquake detail modal not found');
        return;
    }
    
    const riskClass = quake.riskLevel === 'high' ? 'risk-high' : 
                     quake.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';
    const bgColor = quake.riskLevel === 'high' ? 'rgba(230, 57, 70, 0.1)' :
                   quake.riskLevel === 'medium' ? 'rgba(252, 191, 73, 0.1)' : 'rgba(42, 157, 143, 0.1)';
    const textColor = quake.riskLevel === 'high' ? '#e63946' :
                     quake.riskLevel === 'medium' ? '#fcbf49' : '#2a9d8f';
    
    content.innerHTML = `
        <div style="background: ${bgColor}; border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.5rem; border: 2px solid ${textColor};">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                <div style="width: 4rem; height: 4rem; background: ${textColor}; border-radius: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;">
                    <span style="font-size: 1.5rem; font-weight: 700;">${quake.magnitude}</span>
                    <span style="font-size: 0.75rem;">Mag</span>
                </div>
                <div style="flex: 1;">
                    <h3 style="color: var(--etips-textDark); font-weight: 700; font-size: 1.25rem; margin-bottom: 0.25rem;">${quake.location}</h3>
                    <div class="risk-badge ${riskClass}" style="display: inline-block;">
                        ${quake.riskLevel.toUpperCase()} RISK
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 1rem;">
                <div style="background: rgba(255,255,255,0.5); padding: 0.75rem; border-radius: 0.5rem;">
                    <p style="color: #6c757d; font-size: 0.75rem; margin-bottom: 0.25rem;">Distance</p>
                    <p style="color: var(--etips-textDark); font-weight: 700; font-size: 1.125rem;">${quake.distance.toFixed(1)} km</p>
                </div>
                <div style="background: rgba(255,255,255,0.5); padding: 0.75rem; border-radius: 0.5rem;">
                    <p style="color: #6c757d; font-size: 0.75rem; margin-bottom: 0.25rem;">Depth</p>
                    <p style="color: var(--etips-textDark); font-weight: 700; font-size: 1.125rem;">${quake.depth} km</p>
                </div>
                <div style="background: rgba(255,255,255,0.5); padding: 0.75rem; border-radius: 0.5rem;">
                    <p style="color: #6c757d; font-size: 0.75rem; margin-bottom: 0.25rem;">Time</p>
                    <p style="color: var(--etips-textDark); font-weight: 700; font-size: 0.875rem;">${formatTime(quake.timestamp)}</p>
                </div>
                <div style="background: rgba(255,255,255,0.5); padding: 0.75rem; border-radius: 0.5rem;">
                    <p style="color: #6c757d; font-size: 0.75rem; margin-bottom: 0.25rem;">Coordinates</p>
                    <p style="color: var(--etips-textDark); font-weight: 700; font-size: 0.875rem;">${quake.coordinates[0].toFixed(4)}, ${quake.coordinates[1].toFixed(4)}</p>
                </div>
            </div>
        </div>
        
        <div style="background: linear-gradient(135deg, rgba(247, 127, 0, 0.1), rgba(230, 57, 70, 0.1)); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1rem; border: 1px solid rgba(247, 127, 0, 0.3);">
            <h4 style="color: var(--etips-textDark); font-weight: 700; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f77f00" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Safety Information
            </h4>
            <p style="color: var(--etips-textDark); font-size: 0.875rem; line-height: 1.6;">
                ${quake.riskLevel === 'high' ? 
                    '⚠️ <strong>HIGH RISK:</strong> This earthquake poses significant risk. Ensure your emergency kit is ready and review safety procedures immediately.' :
                quake.riskLevel === 'medium' ?
                    '⚡ <strong>MODERATE RISK:</strong> This earthquake requires attention. Check your emergency supplies and stay alert for aftershocks.' :
                    '✓ <strong>LOW RISK:</strong> This earthquake poses minimal immediate threat. Continue normal activities but maintain basic preparedness.'}
            </p>
        </div>
        
        <button onclick="performRiskAssessmentForQuake('${quake.id}')" style="width: 100%; background: linear-gradient(135deg, var(--etips-orange), var(--etips-red)); color: white; padding: 1rem; border-radius: 0.75rem; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(247, 127, 0, 0.3);">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <span>🤖 Analyze This Earthquake with AI</span>
        </button>
    `;
    
    modal.classList.remove('hidden');
    
    // Animate modal entrance
    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#earthquake-detail-modal .modal-content',
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }
}

function closeEarthquakeDetailModal() {
    const modal = document.getElementById('earthquake-detail-modal');
    if (!modal) return;
    
    if (typeof gsap !== 'undefined') {
        gsap.to('#earthquake-detail-modal .modal-content', {
            scale: 0.8,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => modal.classList.add('hidden')
        });
    } else {
        modal.classList.add('hidden');
    }
}

// Enhanced AI Risk Assessment
async function performRiskAssessment() {
    // Show loading modal with animation
    const loadingModal = document.getElementById('loading-modal');
    loadingModal.classList.remove('hidden');
    
    // Update loading text to show it's analyzing recent earthquakes
    const loadingText = loadingModal.querySelector('.loading-text');
    const loadingTitle = loadingModal.querySelector('.loading-title');
    loadingTitle.textContent = 'Analyzing Recent Earthquakes...';
    loadingText.textContent = `Our AI is analyzing ${earthquakes.length} recent earthquake events in your area to assess risk levels.`;
    
    gsap.fromTo('#loading-modal .modal-content',
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
    );
    
    try {
        const response = await fetch('/api/risk-assessment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userLocation)
        });
        
        const assessment = await response.json();
        
        // Hide loading modal after 2.5 seconds with animation
        setTimeout(() => {
            gsap.to('#loading-modal .modal-content', {
                scale: 0.8,
                opacity: 0,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => {
                    loadingModal.classList.add('hidden');
                    showRiskAssessment(assessment);
                }
            });
        }, 2500);
    } catch (error) {
        console.error('Error performing risk assessment:', error);
        loadingModal.classList.add('hidden');
    }
}

function showRiskAssessment(assessment) {
    const modal = document.getElementById('risk-modal');
    const content = document.getElementById('risk-content');
    
    const riskClass = assessment.level === 'high' ? 'risk-high' : 
                     assessment.level === 'medium' ? 'risk-medium' : 'risk-low';
    const bgColor = assessment.level === 'high' ? 'rgba(230, 57, 70, 0.1)' :
                   assessment.level === 'medium' ? 'rgba(252, 191, 73, 0.1)' : 'rgba(42, 157, 143, 0.1)';
    const textColor = assessment.level === 'high' ? '#e63946' :
                     assessment.level === 'medium' ? '#fcbf49' : '#2a9d8f';
    
    let factorsHTML = '';
    assessment.factors.forEach((factor, index) => {
        factorsHTML += `
            <div class="risk-factor" style="animation: slideIn 0.3s ease ${index * 0.1}s both;">
                <div class="factor-info">
                    <p>${factor.name}</p>
                    <p>${factor.description}</p>
                </div>
                <div class="factor-bar">
                    <div class="factor-fill" style="width: ${factor.impact}%; background-color: ${textColor}; animation: fillBar 1s ease ${index * 0.1}s both;"></div>
                </div>
            </div>
        `;
    });
    
    // Build detailed actions list
    let actionsHTML = '';
    if (assessment.detailedActions) {
        actionsHTML = '<div style="margin-top: 1rem;"><h4 style="font-weight: 600; margin-bottom: 0.75rem; color: var(--etips-textDark);">📋 Action Items:</h4><ul style="list-style: none; padding: 0;">';
        assessment.detailedActions.forEach((action, index) => {
            actionsHTML += `<li style="padding: 0.5rem; background: #f8f9fa; border-radius: 0.5rem; margin-bottom: 0.5rem; font-size: 0.875rem; animation: slideIn 0.3s ease ${0.5 + index * 0.1}s both;">${action}</li>`;
        });
        actionsHTML += '</ul></div>';
    }
    
    // Build insights section
    let insightsHTML = '';
    if (assessment.insights) {
        const insights = assessment.insights;
        insightsHTML = `
            <div style="margin-top: 1rem; padding: 1rem; background: rgba(69, 123, 157, 0.1); border-radius: 0.75rem; border-left: 4px solid #457b9d;">
                <h4 style="font-weight: 600; margin-bottom: 0.75rem; color: var(--etips-textDark);">📊 AI Insights:</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; font-size: 0.875rem;">
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">Trend</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${insights.trend}</p>
                    </div>
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">Next Review</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${insights.nextReview}</p>
                    </div>
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">Preparedness</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${insights.preparednessLevel}</p>
                    </div>
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">Nearby Events</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${insights.nearbyEvents}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    content.innerHTML = `
        <div class="risk-score-container" style="background-color: ${bgColor}; animation: scaleIn 0.5s ease both;">
            <div class="risk-score" style="color: ${textColor};">${assessment.score}</div>
            <div class="risk-level-badge ${riskClass}">
                ${assessment.level.toUpperCase()} RISK
            </div>
        </div>
        
        <div class="risk-factors">
            ${factorsHTML}
        </div>
        
        <div class="risk-recommendation" style="animation: slideIn 0.3s ease 0.3s both;">
            <p><span>Summary:</span> ${assessment.recommendation}</p>
        </div>
        
        ${actionsHTML}
        ${insightsHTML}
    `;
    
    modal.classList.remove('hidden');
    
    // Animate modal entrance
    gsap.fromTo('#risk-modal .modal-content',
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
    );
}

function closeRiskModal() {
    const modal = document.getElementById('risk-modal');
    gsap.to('#risk-modal .modal-content', {
        scale: 0.8,
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => modal.classList.add('hidden')
    });
}

// Show alert for nearest earthquake when card is clicked
function showNearestEarthquakeAlert() {
    if (earthquakes.length === 0) {
        alert('No earthquake data available');
        return;
    }
    
    const nearest = earthquakes[0]; // Nearest earthquake
    
    // Navigate to alerts page
    showView('alerts');
    
    // Wait for alerts to render, then scroll to and highlight the nearest earthquake alert
    setTimeout(() => {
        // Find the alert card for this earthquake
        const alertCard = document.querySelector(`[id*="alert-details-eq-${nearest.id}"]`);
        if (alertCard) {
            const parentCard = alertCard.closest('.earthquake-card');
            if (parentCard) {
                // Scroll to the card
                parentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Highlight the card temporarily
                parentCard.style.border = '3px solid #f77f00';
                parentCard.style.boxShadow = '0 0 30px rgba(247, 127, 0, 0.6)';
                
                // Auto-expand the card
                parentCard.click();
                
                // Remove highlight after 3 seconds
                setTimeout(() => {
                    parentCard.style.border = '';
                    parentCard.style.boxShadow = '';
                }, 3000);
            }
        }
    }, 500);
}

// Map initialization for home page
function initMapHome() {
    const mapContainer = document.getElementById('map-home');
    if (!mapContainer) {
        console.log('Map container not found, will retry...');
        return;
    }
    
    if (mapHome) {
        mapHome.remove();
    }
    
    mapHome = L.map('map-home').setView([userLocation.lat, userLocation.lng], 12); // Zoom 12 for wider view
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapHome);
    
    // Add pulsing circle animation for user location
    const pulsingCircle = L.circle([userLocation.lat, userLocation.lng], {
        radius: 100,
        fillColor: '#457b9d',
        fillOpacity: 0.3,
        color: '#457b9d',
        weight: 2,
        className: 'pulsing-circle'
    }).addTo(mapHome);
    
    // Add larger radius circle
    L.circle([userLocation.lat, userLocation.lng], {
        radius: 5000,
        fillColor: '#2a9d8f',
        fillOpacity: 0.05,
        color: '#2a9d8f',
        weight: 1,
        dashArray: '5, 10'
    }).addTo(mapHome);
    
    // Simple location icon
    const userIcon = L.divIcon({
        html: `
            <div style="position: relative; width: 30px; height: 30px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                    <circle cx="12" cy="12" r="11" fill="#e63946" stroke="white" stroke-width="2"/>
                    <circle cx="12" cy="12" r="4" fill="white"/>
                </svg>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 30px; height: 30px; border: 2px solid #e63946; border-radius: 50%; animation: pulse-ring 2s infinite;"></div>
            </div>
        `,
        className: 'user-location-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });
    
    const userMarker = L.marker([userLocation.lat, userLocation.lng], { 
        icon: userIcon,
        zIndexOffset: 1000
    }).addTo(mapHome);
    
    userMarker.bindPopup(`
        <div style="text-align: center; padding: 0.25rem;">
            <div style="font-size: 2rem;">📍</div>
        </div>
    `);
    
    // Add earthquake markers
    earthquakes.forEach(quake => {
        const color = quake.riskLevel === 'high' ? '#e63946' : 
                     quake.riskLevel === 'medium' ? '#fcbf49' : '#2a9d8f';
        
        const quakeIcon = L.divIcon({
            html: `
                <div style="position: relative;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
                        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${quake.magnitude}</text>
                    </svg>
                </div>
            `,
            className: 'earthquake-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        });
        
        L.marker(quake.coordinates, { icon: quakeIcon })
            .addTo(mapHome)
            .bindPopup(`
                <div style="padding: 0.75rem; min-width: 200px;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 2px solid ${color};">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <span style="font-weight: 700; font-size: 1.125rem; color: ${color};">Magnitude ${quake.magnitude}</span>
                    </div>
                    <p style="font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9375rem;">${quake.location}</p>
                    <div style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8125rem; color: #6c757d;">
                        <p>📏 Depth: ${quake.depth}km</p>
                        <p>📍 Distance: ${quake.distance.toFixed(1)}km from you</p>
                        <p>⏰ ${formatTime(quake.timestamp)}</p>
                    </div>
                </div>
            `);
    });
    
    // Update nearest event card
    if (earthquakes.length > 0) {
        const nearest = earthquakes[0];
        console.log('Updating nearest earthquake card with:', nearest);
        
        document.getElementById('nearest-location-home').textContent = nearest.location;
        document.getElementById('nearest-distance-home').textContent = `${nearest.distance.toFixed(1)} km away`;
        document.getElementById('nearest-magnitude-home').textContent = `Magnitude ${nearest.magnitude}`;
        document.getElementById('nearest-time-home').textContent = formatTime(nearest.timestamp);
        document.getElementById('nearest-depth-home').textContent = `${nearest.depth} km deep`;
        
        const riskClass = nearest.riskLevel === 'high' ? 'risk-high' : 
                         nearest.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';
        const riskBgColor = nearest.riskLevel === 'high' ? 'rgba(230, 57, 70, 0.2)' :
                           nearest.riskLevel === 'medium' ? 'rgba(252, 191, 73, 0.2)' : 'rgba(42, 157, 143, 0.2)';
        const riskBorderColor = nearest.riskLevel === 'high' ? '#e63946' :
                               nearest.riskLevel === 'medium' ? '#fcbf49' : '#2a9d8f';
        
        document.getElementById('nearest-risk-badge-home').innerHTML = 
            `<div style="background: ${riskBgColor}; border: 2px solid ${riskBorderColor}; border-radius: 0.75rem; padding: 0.75rem 1rem; text-align: center; min-width: 80px;">
                <div style="font-size: 1.5rem; font-weight: 700; color: ${riskBorderColor}; line-height: 1;">${nearest.magnitude}</div>
                <div style="font-size: 0.625rem; color: ${riskBorderColor}; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem; font-weight: 600;">Magnitude</div>
                <div class="risk-badge ${riskClass}" style="margin-top: 0.5rem; font-size: 0.625rem; padding: 0.25rem 0.5rem;">${nearest.riskLevel.toUpperCase()}</div>
            </div>`;
        
        console.log('✅ Nearest earthquake card updated successfully!');
    } else {
        // No earthquakes found
        console.log('⚠️ No earthquakes to display');
        document.getElementById('nearest-location-home').textContent = 'No recent earthquakes detected';
        document.getElementById('nearest-distance-home').textContent = 'All clear';
        document.getElementById('nearest-magnitude-home').textContent = 'N/A';
        document.getElementById('nearest-time-home').textContent = 'N/A';
        document.getElementById('nearest-depth-home').textContent = 'N/A';
        document.getElementById('nearest-risk-badge-home').innerHTML = 
            `<div style="background: rgba(42, 157, 143, 0.2); border: 2px solid #2a9d8f; border-radius: 0.75rem; padding: 0.75rem 1rem; text-align: center; min-width: 80px;">
                <div style="font-size: 1.5rem; font-weight: 700; color: #2a9d8f; line-height: 1;">✓</div>
                <div style="font-size: 0.625rem; color: #2a9d8f; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem; font-weight: 600;">Safe</div>
            </div>`;
    }
}

// Map initialization
function initMap() {
    if (map) {
        map.remove();
    }
    
    map = L.map('map').setView([userLocation.lat, userLocation.lng], 14); // Zoom 14 for town view
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    // Add pulsing circle animation for user location
    const pulsingCircle = L.circle([userLocation.lat, userLocation.lng], {
        radius: 100,
        fillColor: '#457b9d',
        fillOpacity: 0.3,
        color: '#457b9d',
        weight: 2,
        className: 'pulsing-circle'
    }).addTo(map);
    
    // Add larger radius circle
    L.circle([userLocation.lat, userLocation.lng], {
        radius: 5000,
        fillColor: '#2a9d8f',
        fillOpacity: 0.05,
        color: '#2a9d8f',
        weight: 1,
        dashArray: '5, 10'
    }).addTo(map);
    
    // Simple location icon - just an icon pointing to exact spot
    const userIcon = L.divIcon({
        html: `
            <div style="position: relative; width: 30px; height: 30px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                    <!-- Outer circle -->
                    <circle cx="12" cy="12" r="11" fill="#e63946" stroke="white" stroke-width="2"/>
                    <!-- Inner dot -->
                    <circle cx="12" cy="12" r="4" fill="white"/>
                </svg>
                <!-- Pulsing ring -->
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 30px; height: 30px; border: 2px solid #e63946; border-radius: 50%; animation: pulse-ring 2s infinite;"></div>
            </div>
        `,
        className: 'user-location-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15], // Center of icon
        popupAnchor: [0, -15]
    });
    
    const userMarker = L.marker([userLocation.lat, userLocation.lng], { 
        icon: userIcon,
        zIndexOffset: 1000
    }).addTo(map);
    
    // Simple popup - just icon, no text
    userMarker.bindPopup(`
        <div style="text-align: center; padding: 0.25rem;">
            <div style="font-size: 2rem;">📍</div>
        </div>
    `);
    
    // Add earthquake markers
    earthquakes.forEach(quake => {
        const color = quake.riskLevel === 'high' ? '#e63946' : 
                     quake.riskLevel === 'medium' ? '#fcbf49' : '#2a9d8f';
        
        const quakeIcon = L.divIcon({
            html: `
                <div style="position: relative;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
                        <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${quake.magnitude}</text>
                    </svg>
                </div>
            `,
            className: 'earthquake-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        });
        
        L.marker(quake.coordinates, { icon: quakeIcon })
            .addTo(map)
            .bindPopup(`
                <div style="padding: 0.75rem; min-width: 200px;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 2px solid ${color};">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <span style="font-weight: 700; font-size: 1.125rem; color: ${color};">Magnitude ${quake.magnitude}</span>
                    </div>
                    <p style="font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9375rem;">${quake.location}</p>
                    <div style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8125rem; color: #6c757d;">
                        <p>📏 Depth: ${quake.depth}km</p>
                        <p>📍 Distance: ${quake.distance.toFixed(1)}km from you</p>
                        <p>⏰ ${formatTime(quake.timestamp)}</p>
                    </div>
                </div>
            `);
    });
    
    // Update map overlay
    if (earthquakes.length > 0) {
        const nearest = earthquakes[0];
        document.getElementById('nearest-location').textContent = nearest.location;
        document.getElementById('nearest-meta').textContent = 
            `${nearest.distance.toFixed(1)}km away • M${nearest.magnitude}`;
        
        const riskClass = nearest.riskLevel === 'high' ? 'risk-high' : 
                         nearest.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';
        document.getElementById('nearest-risk-badge').innerHTML = 
            `<div class="risk-badge ${riskClass}">${nearest.riskLevel.toUpperCase()}</div>`;
    }
}


// Load Community Data
async function loadCommunityData() {
    try {
        const response = await fetch('/static/data/community-data.json');
        communityData = await response.json();
        console.log('Community data loaded successfully');
    } catch (error) {
        console.error('Error loading community data:', error);
    }
}

// Show Community Category
function showCommunityCategory(category) {
    // Hide main community page
    document.getElementById('community-main').classList.add('hidden');
    
    // Hide all category pages
    document.getElementById('safety-tips-page').classList.add('hidden');
    document.getElementById('reminders-page').classList.add('hidden');
    document.getElementById('drill-tutorials-page').classList.add('hidden');
    document.getElementById('emergency-kit-page').classList.add('hidden');
    document.getElementById('drill-detail-page').classList.add('hidden');
    
    // Show selected category
    if (category === 'safety-tips') {
        document.getElementById('safety-tips-page').classList.remove('hidden');
        renderSafetyTips();
    } else if (category === 'reminders') {
        document.getElementById('reminders-page').classList.remove('hidden');
        renderReminders();
    } else if (category === 'drill-tutorials') {
        document.getElementById('drill-tutorials-page').classList.remove('hidden');
        renderDrillTutorials();
    } else if (category === 'emergency-kit') {
        document.getElementById('emergency-kit-page').classList.remove('hidden');
        renderEmergencyKit();
    }
    
    // Animate
    gsap.fromTo('.category-page:not(.hidden)',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
    );
}

// Back to Community Main
function backToCommunityMain() {
    document.getElementById('community-main').classList.remove('hidden');
    document.getElementById('safety-tips-page').classList.add('hidden');
    document.getElementById('reminders-page').classList.add('hidden');
    document.getElementById('drill-tutorials-page').classList.add('hidden');
    document.getElementById('emergency-kit-page').classList.add('hidden');
    document.getElementById('drill-detail-page').classList.add('hidden');
}

// Render Safety Tips
function renderSafetyTips() {
    const container = document.getElementById('safety-tips-list');
    container.innerHTML = '';
    
    const categories = ['Before Earthquake', 'During Earthquake', 'After Earthquake'];
    
    categories.forEach(cat => {
        const tips = communityData.safetyTips.filter(tip => tip.category === cat);
        if (tips.length > 0) {
            const categorySection = document.createElement('div');
            categorySection.style.marginBottom = '1.5rem';
            categorySection.innerHTML = `
                <h3 style="color: white; font-weight: 600; font-size: 1rem; margin-bottom: 0.75rem; padding-left: 0.5rem; border-left: 4px solid var(--etips-red);">
                    ${cat}
                </h3>
            `;
            
            tips.forEach((tip, index) => {
                const tipCard = document.createElement('div');
                tipCard.className = 'tip-item-card';
                tipCard.style.cssText = `
                    background: rgba(247, 127, 0, 0.08);
                    border-radius: 0.75rem;
                    padding: 1rem;
                    margin-bottom: 0.75rem;
                    border: 1px solid rgba(247, 127, 0, 0.2);
                    transition: all 0.3s ease;
                    animation: slideIn 0.3s ease ${index * 0.1}s both;
                `;
                
                tipCard.innerHTML = `
                    <div style="display: flex; align-items: start; gap: 1rem;">
                        <div style="width: 3rem; height: 3rem; background: rgba(230, 57, 70, 0.2); border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e63946" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <div style="flex: 1;">
                            <h4 style="color: white; font-weight: 600; margin-bottom: 0.25rem;">${tip.title}</h4>
                            <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; line-height: 1.5;">${tip.description}</p>
                        </div>
                    </div>
                `;
                
                tipCard.addEventListener('mouseenter', () => {
                    tipCard.style.borderColor = 'rgba(247, 127, 0, 0.5)';
                    tipCard.style.boxShadow = '0 4px 20px rgba(247, 127, 0, 0.3)';
                    tipCard.style.transform = 'translateY(-2px)';
                });
                
                tipCard.addEventListener('mouseleave', () => {
                    tipCard.style.borderColor = 'rgba(247, 127, 0, 0.2)';
                    tipCard.style.boxShadow = 'none';
                    tipCard.style.transform = 'translateY(0)';
                });
                
                categorySection.appendChild(tipCard);
            });
            
            container.appendChild(categorySection);
        }
    });
}

// Render Reminders
function renderReminders() {
    const container = document.getElementById('reminders-list');
    container.innerHTML = '';
    
    // Add header for creator reminders
    const creatorHeader = document.createElement('div');
    creatorHeader.style.cssText = 'margin-bottom: 1.5rem;';
    creatorHeader.innerHTML = `
        <h3 style="color: white; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.5rem;">👥 Safety Reminders from the Community</h3>
        <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; line-height: 1.6;">
            Important earthquake preparedness reminders from our safety advocates. Stay informed and stay safe!
        </p>
    `;
    container.appendChild(creatorHeader);
    
    // Create the 6 reminder cards with photos (3 original + 3 new)
    const creatorReminders = [
        // ORIGINAL 3 REMINDERS
        {
            image: '/static/images/reminder-1.jpg',
            badge: 'SAFETY REMINDER',
            badgeColor: '#e63946',
            badgeBg: 'rgba(230, 57, 70, 0.2)',
            gradient: 'linear-gradient(135deg, rgba(230, 57, 70, 0.2), rgba(247, 127, 0, 0.2))',
            title: '🏠 Secure Your Home Before Disaster Strikes',
            description: 'Anchor heavy furniture, water heaters, and appliances to walls. Secure hanging objects and mirrors. A few minutes of preparation today can prevent serious injuries during an earthquake. Check your home\'s structural integrity regularly and fix any cracks or weaknesses.',
            icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>'
        },
        {
            image: '/static/images/reminder-2.jpg',
            badge: 'EMERGENCY PREPAREDNESS',
            badgeColor: '#fcbf49',
            badgeBg: 'rgba(252, 191, 73, 0.2)',
            gradient: 'linear-gradient(135deg, rgba(252, 191, 73, 0.2), rgba(247, 127, 0, 0.2))',
            title: '🎒 Build Your Emergency Kit Today',
            description: 'Prepare a 72-hour emergency kit with water (1 gallon per person per day), non-perishable food, first aid supplies, flashlight, batteries, radio, and essential medications. Don\'t forget important documents, cash, and supplies for infants, elderly, or pets. Update your kit every 6 months.',
            icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
        },
        {
            image: '/static/images/reminder-3.jpg',
            badge: 'FAMILY SAFETY',
            badgeColor: '#2a9d8f',
            badgeBg: 'rgba(42, 157, 143, 0.2)',
            gradient: 'linear-gradient(135deg, rgba(42, 157, 143, 0.2), rgba(69, 123, 157, 0.2))',
            title: '👨‍👩‍👧‍👦 Practice DROP, COVER, and HOLD ON',
            description: 'Conduct monthly earthquake drills with your entire family. Practice DROP to the ground, take COVER under a sturdy table, and HOLD ON until shaking stops. Make sure everyone knows safe spots in each room and establish a family communication plan with out-of-town contacts.',
            icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'
        },
        // NEW 3 REMINDERS ADDED
        {
            image: '/static/images/reminder-4.jpg',
            badge: 'COMMUNITY SAFETY',
            badgeColor: '#9b59b6',
            badgeBg: 'rgba(155, 89, 182, 0.2)',
            gradient: 'linear-gradient(135deg, rgba(155, 89, 182, 0.2), rgba(142, 68, 173, 0.2))',
            title: '🤝 Stay Connected with Your Community',
            description: 'Build relationships with neighbors and join local emergency response teams. Share resources, skills, and support during disasters. A strong community network can save lives and speed up recovery. Participate in community drills and emergency planning meetings.',
            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>'
        },
        {
            image: '/static/images/reminder-5.jpg',
            badge: 'EVACUATION PLANNING',
            badgeColor: '#e67e22',
            badgeBg: 'rgba(230, 126, 34, 0.2)',
            gradient: 'linear-gradient(135deg, rgba(230, 126, 34, 0.2), rgba(211, 84, 0, 0.2))',
            title: '🚪 Know Your Evacuation Routes',
            description: 'Identify multiple evacuation routes from your home, workplace, and school. Practice these routes regularly with your family. Know the location of emergency shelters and assembly points. Keep a go-bag ready with essentials for quick evacuation.',
            icon: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>'
        },
        {
            image: '/static/images/reminder-6.jpg',
            badge: 'STAY INFORMED',
            badgeColor: '#3498db',
            badgeBg: 'rgba(52, 152, 219, 0.2)',
            gradient: 'linear-gradient(135deg, rgba(52, 152, 219, 0.2), rgba(41, 128, 185, 0.2))',
            title: '📱 Monitor Earthquake Alerts & Updates',
            description: 'Stay informed through E-TIPS app, local news, and official emergency channels. Enable push notifications for earthquake alerts. Follow PHIVOLCS and local disaster management offices on social media. Keep a battery-powered radio for emergencies when power is out.',
            icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>'
        }
    ];
    
    creatorReminders.forEach((reminder, index) => {
        const reminderCard = document.createElement('div');
        reminderCard.style.cssText = `
            background: rgba(247, 127, 0, 0.08);
            border-radius: 1rem;
            overflow: hidden;
            border: 1px solid rgba(247, 127, 0, 0.2);
            margin-bottom: 1.5rem;
            transition: all 0.3s ease;
            animation: slideIn 0.3s ease ${index * 0.1}s both;
        `;
        
        reminderCard.innerHTML = `
            <div style="display: flex; flex-direction: row; align-items: stretch;">
                <!-- Image on the left - full picture visible -->
                <div style="width: 35%; min-height: 250px; background: ${reminder.gradient}; display: flex; align-items: center; justify-content: center; padding: 1rem;">
                    <div style="width: 100%; height: 100%; border-radius: 0.75rem; overflow: hidden; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);">
                        <img src="${reminder.image}" alt="Safety Reminder" style="width: 100%; height: 100%; object-fit: contain; background: ${reminder.gradient};">
                    </div>
                </div>
                <!-- Content on the right -->
                <div style="flex: 1; padding: 1.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                        <div style="width: 2.5rem; height: 2.5rem; background: ${reminder.badgeBg}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${reminder.badgeColor}" stroke-width="2">
                                ${reminder.icon}
                            </svg>
                        </div>
                        <span style="color: rgba(255,255,255,0.6); font-size: 0.875rem; font-weight: 600;">${reminder.badge}</span>
                    </div>
                    <h4 style="color: white; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.75rem;">${reminder.title}</h4>
                    <p style="color: rgba(255,255,255,0.8); font-size: 0.9375rem; line-height: 1.7;">
                        ${reminder.description}
                    </p>
                </div>
            </div>
        `;
        
        reminderCard.addEventListener('mouseenter', () => {
            reminderCard.style.borderColor = 'rgba(247, 127, 0, 0.5)';
            reminderCard.style.boxShadow = '0 8px 24px rgba(247, 127, 0, 0.3)';
            reminderCard.style.transform = 'translateY(-2px)';
        });
        
        reminderCard.addEventListener('mouseleave', () => {
            reminderCard.style.borderColor = 'rgba(247, 127, 0, 0.2)';
            reminderCard.style.boxShadow = 'none';
            reminderCard.style.transform = 'translateY(0)';
        });
        
        container.appendChild(reminderCard);
    });
    
    // Add separator
    const separator = document.createElement('div');
    separator.style.cssText = 'height: 2px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent); margin: 2rem 0;';
    container.appendChild(separator);
    
    // Add header for regular reminders
    const regularHeader = document.createElement('div');
    regularHeader.style.cssText = 'margin-bottom: 1.5rem;';
    regularHeader.innerHTML = `
        <h3 style="color: white; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.5rem;">🔔 Regular Maintenance Reminders</h3>
        <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; line-height: 1.6;">
            Keep your emergency preparedness up-to-date with these regular maintenance tasks
        </p>
    `;
    container.appendChild(regularHeader);
    
    // Add original reminders from communityData
    communityData.reminders.forEach((reminder, index) => {
        const priorityColor = reminder.priority === 'high' ? '#e63946' : 
                             reminder.priority === 'medium' ? '#fcbf49' : '#2a9d8f';
        const priorityBg = reminder.priority === 'high' ? 'rgba(230, 57, 70, 0.2)' : 
                          reminder.priority === 'medium' ? 'rgba(252, 191, 73, 0.2)' : 'rgba(42, 157, 143, 0.2)';
        
        const reminderCard = document.createElement('div');
        reminderCard.className = 'reminder-card';
        reminderCard.style.cssText = `
            background: rgba(247, 127, 0, 0.08);
            border-radius: 0.75rem;
            padding: 1rem;
            margin-bottom: 0.75rem;
            border-left: 4px solid ${priorityColor};
            border-right: 1px solid rgba(247, 127, 0, 0.2);
            border-top: 1px solid rgba(247, 127, 0, 0.2);
            border-bottom: 1px solid rgba(247, 127, 0, 0.2);
            transition: all 0.3s ease;
            animation: slideIn 0.3s ease ${(index + 3) * 0.1}s both;
        `;
        
        reminderCard.innerHTML = `
            <div style="display: flex; align-items: start; justify-content: space-between; gap: 1rem;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="background: ${priorityBg}; color: ${priorityColor}; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">
                            ${reminder.priority}
                        </span>
                        <span style="color: rgba(255,255,255,0.5); font-size: 0.75rem;">
                            ${reminder.frequency}
                        </span>
                    </div>
                    <h4 style="color: white; font-weight: 600; margin-bottom: 0.25rem;">${reminder.title}</h4>
                    <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; line-height: 1.5;">${reminder.description}</p>
                </div>
                <div style="width: 2.5rem; height: 2.5rem; background: ${priorityBg}; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${priorityColor}" stroke-width="2">
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
                    </svg>
                </div>
            </div>
        `;
        
        reminderCard.addEventListener('mouseenter', () => {
            reminderCard.style.borderLeftColor = priorityColor;
            reminderCard.style.boxShadow = `0 4px 20px ${priorityBg}`;
            reminderCard.style.transform = 'translateX(4px)';
        });
        
        reminderCard.addEventListener('mouseleave', () => {
            reminderCard.style.boxShadow = 'none';
            reminderCard.style.transform = 'translateX(0)';
        });
        
        container.appendChild(reminderCard);
    });
}

// Render Drill Tutorials
function renderDrillTutorials() {
    const container = document.getElementById('drill-tutorials-list');
    container.innerHTML = '';
    
    communityData.drillTutorials.forEach((drill, index) => {
        const difficultyColor = drill.difficulty === 'Easy' ? '#2a9d8f' : 
                               drill.difficulty === 'Medium' ? '#fcbf49' : '#e63946';
        
        const drillCard = document.createElement('div');
        drillCard.className = 'drill-card';
        drillCard.style.cssText = `
            background: rgba(247, 127, 0, 0.08);
            border-radius: 0.75rem;
            overflow: hidden;
            margin-bottom: 1rem;
            border: 1px solid rgba(247, 127, 0, 0.2);
            transition: all 0.3s ease;
            cursor: pointer;
            animation: slideIn 0.3s ease ${index * 0.1}s both;
        `;
        
        drillCard.innerHTML = `
            <div style="position: relative; height: 120px; background: linear-gradient(135deg, rgba(230, 57, 70, 0.3), rgba(247, 127, 0, 0.3)); overflow: hidden;">
                <img src="${drill.image}" alt="${drill.title}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.4;">
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.7));"></div>
                <div style="position: absolute; top: 0.75rem; right: 0.75rem;">
                    <span style="background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); color: ${difficultyColor}; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">
                        ${drill.difficulty}
                    </span>
                </div>
                <div style="position: absolute; bottom: 0.75rem; left: 0.75rem; right: 0.75rem;">
                    <h3 style="color: white; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.25rem;">${drill.title}</h3>
                    <div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; color: rgba(255,255,255,0.9);">
                        <span>⏱️ ${drill.duration}</span>
                        <span>📋 ${drill.steps.length} steps</span>
                    </div>
                </div>
            </div>
            <div style="padding: 1rem;">
                <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; line-height: 1.5; margin-bottom: 0.75rem;">${drill.description}</p>
                <button style="width: 100%; background: linear-gradient(135deg, var(--etips-red), var(--etips-orange)); color: white; padding: 0.75rem; border-radius: 0.5rem; border: none; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                    View Tutorial →
                </button>
            </div>
        `;
        
        drillCard.addEventListener('click', () => showDrillDetail(drill));
        
        drillCard.addEventListener('mouseenter', () => {
            drillCard.style.borderColor = 'rgba(247, 127, 0, 0.6)';
            drillCard.style.boxShadow = '0 8px 30px rgba(247, 127, 0, 0.3)';
            drillCard.style.transform = 'translateY(-4px)';
        });
        
        drillCard.addEventListener('mouseleave', () => {
            drillCard.style.borderColor = 'rgba(247, 127, 0, 0.2)';
            drillCard.style.boxShadow = 'none';
            drillCard.style.transform = 'translateY(0)';
        });
        
        container.appendChild(drillCard);
    });
}

// Show Drill Detail
function showDrillDetail(drill) {
    document.getElementById('drill-tutorials-page').classList.add('hidden');
    const detailPage = document.getElementById('drill-detail-page');
    detailPage.classList.remove('hidden');
    
    // Populate detail page
    document.getElementById('drill-detail-title').textContent = drill.title;
    document.getElementById('drill-detail-description').textContent = drill.description;
    document.getElementById('drill-detail-image').src = drill.image;
    document.getElementById('drill-detail-duration').textContent = drill.duration;
    document.getElementById('drill-detail-difficulty').textContent = drill.difficulty;
    
    const difficultyColor = drill.difficulty === 'Easy' ? '#2a9d8f' : 
                           drill.difficulty === 'Medium' ? '#fcbf49' : '#e63946';
    document.getElementById('drill-detail-difficulty').style.color = difficultyColor;
    
    // Render steps
    const stepsContainer = document.getElementById('drill-detail-steps');
    stepsContainer.innerHTML = '';
    
    drill.steps.forEach((step, index) => {
        const stepCard = document.createElement('div');
        stepCard.style.cssText = `
            background: rgba(247, 127, 0, 0.08);
            border-radius: 0.75rem;
            padding: 1rem;
            margin-bottom: 1rem;
            border-left: 4px solid var(--etips-red);
            border-right: 1px solid rgba(247, 127, 0, 0.2);
            border-top: 1px solid rgba(247, 127, 0, 0.2);
            border-bottom: 1px solid rgba(247, 127, 0, 0.2);
            animation: slideIn 0.3s ease ${index * 0.1}s both;
        `;
        
        stepCard.innerHTML = `
            <div style="display: flex; align-items: start; gap: 1rem;">
                <div style="width: 2.5rem; height: 2.5rem; background: var(--etips-red); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 700; color: white;">
                    ${step.number}
                </div>
                <div style="flex: 1;">
                    <h4 style="color: white; font-weight: 700; font-size: 1rem; margin-bottom: 0.5rem;">${step.title}</h4>
                    <p style="color: rgba(255,255,255,0.8); font-size: 0.875rem; line-height: 1.6; margin-bottom: 0.5rem;">${step.description}</p>
                    <div style="background: rgba(247, 127, 0, 0.1); border-left: 3px solid var(--etips-orange); padding: 0.5rem 0.75rem; border-radius: 0.5rem;">
                        <p style="color: rgba(255,255,255,0.9); font-size: 0.8125rem;">💡 <strong>Tip:</strong> ${step.tip}</p>
                    </div>
                </div>
            </div>
        `;
        
        stepsContainer.appendChild(stepCard);
    });
    
    // Render important notes
    const notesContainer = document.getElementById('drill-detail-notes');
    notesContainer.innerHTML = '';
    
    drill.importantNotes.forEach((note, index) => {
        const noteItem = document.createElement('div');
        noteItem.style.cssText = `
            background: rgba(230, 57, 70, 0.1);
            border-radius: 0.5rem;
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            border-left: 3px solid var(--etips-red);
            animation: slideIn 0.3s ease ${0.5 + index * 0.1}s both;
        `;
        noteItem.innerHTML = `
            <p style="color: rgba(255,255,255,0.9); font-size: 0.875rem; line-height: 1.5;">⚠️ ${note}</p>
        `;
        notesContainer.appendChild(noteItem);
    });
    
    // Animate
    gsap.fromTo('#drill-detail-page',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
    );
}

// Back to Drill Tutorials
function backToDrillTutorials() {
    document.getElementById('drill-detail-page').classList.add('hidden');
    document.getElementById('drill-tutorials-page').classList.remove('hidden');
}

// Render Emergency Kit
function renderEmergencyKit() {
    const container = document.getElementById('emergency-kit-list');
    container.innerHTML = '';
    
    communityData.emergencyKit.forEach((category, catIndex) => {
        const categorySection = document.createElement('div');
        categorySection.style.marginBottom = '2rem';
        
        const categoryHeader = document.createElement('div');
        categoryHeader.style.cssText = `
            background: linear-gradient(135deg, rgba(230, 57, 70, 0.2), rgba(247, 127, 0, 0.2));
            border-radius: 0.75rem;
            padding: 1rem;
            margin-bottom: 1rem;
            border: 1px solid rgba(230, 57, 70, 0.3);
            animation: slideIn 0.3s ease ${catIndex * 0.1}s both;
        `;
        categoryHeader.innerHTML = `
            <h3 style="color: white; font-weight: 700; font-size: 1.125rem; display: flex; align-items: center; gap: 0.5rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--etips-red)" stroke-width="2">
                    <path d="M20 7h-9"></path>
                    <path d="M14 17H5"></path>
                    <circle cx="17" cy="17" r="3"></circle>
                    <circle cx="7" cy="7" r="3"></circle>
                </svg>
                ${category.category}
            </h3>
            <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; margin-top: 0.25rem;">${category.items.length} items</p>
        `;
        categorySection.appendChild(categoryHeader);
        
        // Create grid container for items
        const gridContainer = document.createElement('div');
        gridContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1rem;
        `;
        
        category.items.forEach((item, itemIndex) => {
            const priorityColor = item.priority === 'critical' ? '#e63946' : 
                                 item.priority === 'high' ? '#fcbf49' : 
                                 item.priority === 'medium' ? '#457b9d' : '#2a9d8f';
            const priorityBg = item.priority === 'critical' ? 'rgba(230, 57, 70, 0.2)' : 
                              item.priority === 'high' ? 'rgba(252, 191, 73, 0.2)' : 
                              item.priority === 'medium' ? 'rgba(69, 123, 157, 0.2)' : 'rgba(42, 157, 143, 0.2)';
            
            const itemCard = document.createElement('div');
            itemCard.style.cssText = `
                background: rgba(247, 127, 0, 0.08);
                border-radius: 0.75rem;
                padding: 1rem;
                border: 1px solid rgba(247, 127, 0, 0.2);
                transition: all 0.3s ease;
                animation: slideIn 0.3s ease ${catIndex * 0.1 + itemIndex * 0.05}s both;
                display: flex;
                flex-direction: column;
                height: 100%;
            `;
            
            // Build image HTML if item has an image - SQUARE BOX at top
            const imageHTML = item.image ? `
                <div style="width: 100%; display: flex; justify-content: center; margin-bottom: 1rem;">
                    <div style="width: 150px; height: 150px;">
                        <img src="${item.image}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 0.75rem; background: rgba(0, 0, 0, 0.2); padding: 0.75rem;">
                    </div>
                </div>
            ` : '';
            
            itemCard.innerHTML = `
                ${imageHTML}
                <div style="display: flex; align-items: start; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <input type="checkbox" style="width: 1.25rem; height: 1.25rem; margin-top: 0.25rem; cursor: pointer; accent-color: var(--etips-red); flex-shrink: 0;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap;">
                            <h4 style="color: white; font-weight: 600; font-size: 0.9375rem;">${item.name}</h4>
                            <span style="background: ${priorityBg}; color: ${priorityColor}; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;">
                                ${item.priority}
                            </span>
                        </div>
                        <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; margin-bottom: 0.25rem;">
                            <strong style="color: var(--etips-orange);">Quantity:</strong> ${item.quantity}
                        </p>
                        <p style="color: rgba(255,255,255,0.6); font-size: 0.8125rem; font-style: italic;">
                            ${item.notes}
                        </p>
                    </div>
                </div>
            `;
            
            itemCard.addEventListener('mouseenter', () => {
                itemCard.style.borderColor = priorityColor;
                itemCard.style.boxShadow = `0 4px 20px ${priorityBg}`;
                itemCard.style.transform = 'translateY(-4px)';
            });
            
            itemCard.addEventListener('mouseleave', () => {
                itemCard.style.borderColor = 'rgba(247, 127, 0, 0.2)';
                itemCard.style.boxShadow = 'none';
                itemCard.style.transform = 'translateY(0)';
            });
            
            gridContainer.appendChild(itemCard);
        });
        
        categorySection.appendChild(gridContainer);
        container.appendChild(categorySection);
    });
}


// Emergency Contact Call Permission Function
function requestCallPermission(contactName, displayNumber, telLink) {
    // Create custom permission dialog
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 1rem;
    `;
    
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #1d3557, #29537a); border-radius: 1rem; padding: 2rem; max-width: 400px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1);">
            <!-- Icon -->
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="width: 4rem; height: 4rem; background: rgba(230, 57, 70, 0.2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e63946" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                </div>
                <h3 style="color: white; font-weight: 700; font-size: 1.25rem; margin-bottom: 0.5rem;">📞 Call Emergency Contact?</h3>
            </div>
            
            <!-- Contact Info -->
            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.1);">
                <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem; margin-bottom: 0.25rem;">Calling:</p>
                <p style="color: white; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.5rem;">${contactName}</p>
                <p style="color: #e63946; font-weight: 600; font-size: 1rem;">${displayNumber}</p>
            </div>
            
            <!-- Permission Notice -->
            <div style="background: rgba(69, 123, 157, 0.2); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.5rem; border-left: 4px solid #457b9d;">
                <p style="color: rgba(255,255,255,0.9); font-size: 0.875rem; line-height: 1.6;">
                    <strong style="color: #457b9d;">🔒 Privacy & Permissions:</strong><br>
                    E-TIPS will access your phone's dialer to make this emergency call. We do not store, access, or share your contact information. This permission is only used to help you quickly reach emergency services.
                </p>
            </div>
            
            <!-- Buttons -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <button onclick="closeCallPermissionModal()" style="background: rgba(255, 255, 255, 0.1); color: white; padding: 0.875rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.2); font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                    Cancel
                </button>
                <button onclick="makeEmergencyCall('${telLink}')" style="background: linear-gradient(135deg, #e63946, #a4161a); color: white; padding: 0.875rem; border-radius: 0.5rem; border: none; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(230, 57, 70, 0.3);">
                    📞 Call Now
                </button>
            </div>
            
            <!-- Terms -->
            <p style="color: rgba(255,255,255,0.5); font-size: 0.75rem; text-align: center; margin-top: 1rem; line-height: 1.5;">
                By clicking "Call Now", you agree to allow E-TIPS to access your phone's dialer for this emergency call only.
            </p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Animate modal entrance
    if (typeof gsap !== 'undefined') {
        gsap.fromTo(modal.querySelector('div'), 
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }
    
    // Store modal reference for closing
    window.currentCallModal = modal;
}

function closeCallPermissionModal() {
    const modal = window.currentCallModal;
    if (!modal) return;
    
    if (typeof gsap !== 'undefined') {
        gsap.to(modal.querySelector('div'), {
            scale: 0.8,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => {
                modal.remove();
                window.currentCallModal = null;
            }
        });
    } else {
        modal.remove();
        window.currentCallModal = null;
    }
}

function makeEmergencyCall(telLink) {
    // Close the modal
    closeCallPermissionModal();
    
    // Initiate the phone call
    window.location.href = telLink;
    
    // Show confirmation message
    setTimeout(() => {
        showCallConfirmation();
    }, 500);
}

function showCallConfirmation() {
    const confirmation = document.createElement('div');
    confirmation.style.cssText = `
        position: fixed;
        top: 2rem;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #2a9d8f, #1b7f72);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    confirmation.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
        <span>Opening phone dialer...</span>
    `;
    
    document.body.appendChild(confirmation);
    
    // Animate entrance
    if (typeof gsap !== 'undefined') {
        gsap.fromTo(confirmation,
            { y: -100, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }
        );
    }
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to(confirmation, {
                y: -100,
                opacity: 0,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => confirmation.remove()
            });
        } else {
            confirmation.remove();
        }
    }, 3000);
}


// ============================================
// COMMUNITY TIPS - USER AUTHENTICATION & POSTING
// ============================================

// Store current user data
let currentUser = null;
let communityTips = [];

// Check if user is already logged in (from localStorage)
function checkUserSession() {
    const savedUser = localStorage.getItem('etips_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showUserProfile();
        loadCommunityTips();
    } else {
        loadCommunityTips();
    }
}

// ============================================
// ENHANCED ACCOUNT SELECTION & MANAGEMENT
// ============================================

// Show account selector modal
function showAccountSelector(provider) {
    const providerNames = {
        'google': 'Google',
        'facebook': 'Facebook',
        'twitter': 'X (Twitter)',
        'apple': 'Apple'
    };
    
    const providerColors = {
        'google': '#4285F4',
        'facebook': '#1877F2',
        'twitter': '#000000',
        'apple': '#000000'
    };
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'accountSelectorModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 1rem;
    `;
    
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #1d3557, #29537a); border-radius: 1rem; padding: 2rem; max-width: 450px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); max-height: 90vh; overflow-y: auto;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="width: 4rem; height: 4rem; background: ${providerColors[provider]}20; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
                    <span style="font-size: 2rem;">${provider === 'google' ? '🔵' : provider === 'facebook' ? '📘' : provider === 'twitter' ? '✖️' : '🍎'}</span>
                </div>
                <h3 style="color: white; font-weight: 700; font-size: 1.25rem; margin-bottom: 0.5rem;">Choose Your ${providerNames[provider]} Account</h3>
                <p style="color: rgba(255,255,255,0.7); font-size: 0.875rem;">Select an account to connect to E-TIPS</p>
            </div>
            
            <!-- Account Options -->
            <div id="accountOptions" style="display: grid; gap: 0.75rem; margin-bottom: 1.5rem;">
                <!-- Accounts will be loaded here -->
            </div>
            
            <!-- Add New Account -->
            <button onclick="addNewAccount('${provider}')" style="width: 100%; background: rgba(255, 255, 255, 0.1); color: white; padding: 1rem; border-radius: 0.75rem; border: 1px dashed rgba(255, 255, 255, 0.3); font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;">
                <span style="font-size: 1.5rem;">➕</span>
                <span>Add Another ${providerNames[provider]} Account</span>
            </button>
            
            <!-- Cancel Button -->
            <button onclick="closeAccountSelector()" style="width: 100%; background: rgba(230, 57, 70, 0.2); color: #e63946; padding: 0.875rem; border-radius: 0.75rem; border: 1px solid rgba(230, 57, 70, 0.3); font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                Cancel
            </button>
            
            <!-- Privacy Notice -->
            <p style="color: rgba(255,255,255,0.5); font-size: 0.75rem; text-align: center; margin-top: 1rem; line-height: 1.5;">
                🔒 Your account information is stored securely and only used for authentication.
            </p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load available accounts for this provider
    loadProviderAccounts(provider);
    
    // Animate entrance
    if (typeof gsap !== 'undefined') {
        gsap.fromTo(modal.querySelector('div'), 
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }
}

// Load available accounts for provider
function loadProviderAccounts(provider) {
    const container = document.getElementById('accountOptions');
    
    // Get saved accounts from localStorage
    const savedAccounts = JSON.parse(localStorage.getItem('etips_accounts') || '{}');
    const providerAccounts = savedAccounts[provider] || [];
    
    if (providerAccounts.length === 0) {
        // No saved accounts, show add new option
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.6);">
                <p style="margin-bottom: 1rem;">No ${provider} accounts connected yet</p>
                <p style="font-size: 0.875rem;">Click "Add Another Account" below to connect your first account</p>
            </div>
        `;
    } else {
        // Show saved accounts
        container.innerHTML = '';
        providerAccounts.forEach((account, index) => {
            const accountCard = document.createElement('div');
            accountCard.style.cssText = `
                background: rgba(255, 255, 255, 0.05);
                border-radius: 0.75rem;
                padding: 1rem;
                border: 2px solid rgba(255, 255, 255, 0.1);
                cursor: pointer;
                transition: all 0.3s ease;
            `;
            
            accountCard.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <img src="${account.avatar}" alt="${account.name}" style="width: 3rem; height: 3rem; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.3);">
                    <div style="flex: 1;">
                        <h4 style="color: white; font-weight: 700; font-size: 0.9375rem; margin-bottom: 0.25rem;">${account.name}</h4>
                        <p style="color: rgba(255,255,255,0.6); font-size: 0.8125rem;">${account.email}</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </div>
            `;
            
            accountCard.addEventListener('click', () => selectAccount(provider, account));
            
            accountCard.addEventListener('mouseenter', () => {
                accountCard.style.borderColor = 'rgba(42, 157, 143, 0.5)';
                accountCard.style.background = 'rgba(42, 157, 143, 0.1)';
                accountCard.style.transform = 'translateX(4px)';
            });
            
            accountCard.addEventListener('mouseleave', () => {
                accountCard.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                accountCard.style.background = 'rgba(255, 255, 255, 0.05)';
                accountCard.style.transform = 'translateX(0)';
            });
            
            container.appendChild(accountCard);
        });
    }
}

// Select an account
function selectAccount(provider, account) {
    closeAccountSelector();
    showLoadingToast(`Connecting to ${account.name}...`);
    
    setTimeout(() => {
        const userData = {
            ...account,
            provider: provider,
            loginTime: new Date().toISOString()
        };
        
        completeLogin(userData);
    }, 1000);
}

// Add new account
function addNewAccount(provider) {
    closeAccountSelector();
    
    // Use REAL OAuth if available, fallback to mock
    if (provider === 'google') {
        if (typeof window.loginWithGoogleReal !== 'undefined') {
            loginWithGoogleReal();
        } else {
            loginWithGoogle();
        }
    } else if (provider === 'facebook') {
        if (typeof window.loginWithFacebookReal !== 'undefined') {
            loginWithFacebookReal();
        } else {
            loginWithFacebook();
        }
    } else if (provider === 'twitter') {
        if (typeof window.loginWithTwitterReal !== 'undefined') {
            loginWithTwitterReal();
        } else {
            loginWithTwitter();
        }
    } else if (provider === 'apple') {
        if (typeof window.loginWithAppleReal !== 'undefined') {
            loginWithAppleReal();
        } else {
            loginWithApple();
        }
    }
}

// Close account selector
function closeAccountSelector() {
    const modal = document.getElementById('accountSelectorModal');
    if (!modal) return;
    
    if (typeof gsap !== 'undefined') {
        gsap.to(modal.querySelector('div'), {
            scale: 0.8,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => modal.remove()
        });
    } else {
        modal.remove();
    }
}

// Twitter Login
function loginWithTwitter() {
    showLoadingToast('Connecting to X (Twitter)...');
    
    setTimeout(() => {
        const mockTwitterUser = {
            id: 'twitter_' + Date.now(),
            name: 'Twitter User',
            email: 'user@twitter.com',
            avatar: 'https://ui-avatars.com/api/?name=Twitter+User&background=000000&color=fff&size=128',
            provider: 'twitter',
            loginTime: new Date().toISOString()
        };
        
        completeLogin(mockTwitterUser);
        saveAccountToList('twitter', mockTwitterUser);
    }, 1500);
}

// Apple Login
function loginWithApple() {
    showLoadingToast('Connecting to Apple...');
    
    setTimeout(() => {
        const mockAppleUser = {
            id: 'apple_' + Date.now(),
            name: 'Apple User',
            email: 'user@icloud.com',
            avatar: 'https://ui-avatars.com/api/?name=Apple+User&background=000000&color=fff&size=128',
            provider: 'apple',
            loginTime: new Date().toISOString()
        };
        
        completeLogin(mockAppleUser);
        saveAccountToList('apple', mockAppleUser);
    }, 1500);
}

// Save account to list
function saveAccountToList(provider, userData) {
    const savedAccounts = JSON.parse(localStorage.getItem('etips_accounts') || '{}');
    
    if (!savedAccounts[provider]) {
        savedAccounts[provider] = [];
    }
    
    // Check if account already exists
    const exists = savedAccounts[provider].some(acc => acc.email === userData.email);
    
    if (!exists) {
        savedAccounts[provider].push({
            id: userData.id,
            name: userData.name,
            email: userData.email,
            avatar: userData.avatar
        });
        
        localStorage.setItem('etips_accounts', JSON.stringify(savedAccounts));
    }
}

// Manage accounts
function manageAccounts() {
    const modal = document.createElement('div');
    modal.id = 'manageAccountsModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 1rem;
    `;
    
    const savedAccounts = JSON.parse(localStorage.getItem('etips_accounts') || '{}');
    let accountsHTML = '';
    
    Object.keys(savedAccounts).forEach(provider => {
        savedAccounts[provider].forEach(account => {
            const providerIcon = provider === 'google' ? '🔵' : provider === 'facebook' ? '📘' : provider === 'twitter' ? '✖️' : '🍎';
            const isCurrentAccount = currentUser && currentUser.email === account.email;
            
            accountsHTML += `
                <div style="background: rgba(255, 255, 255, 0.05); border-radius: 0.75rem; padding: 1rem; border: 2px solid ${isCurrentAccount ? 'rgba(42, 157, 143, 0.5)' : 'rgba(255, 255, 255, 0.1)'}; margin-bottom: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <img src="${account.avatar}" alt="${account.name}" style="width: 3rem; height: 3rem; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.3);">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                <h4 style="color: white; font-weight: 700; font-size: 0.9375rem;">${account.name}</h4>
                                ${isCurrentAccount ? '<span style="background: rgba(42, 157, 143, 0.3); color: #2a9d8f; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600;">ACTIVE</span>' : ''}
                            </div>
                            <p style="color: rgba(255,255,255,0.6); font-size: 0.8125rem; margin-bottom: 0.25rem;">${account.email}</p>
                            <p style="color: rgba(255,255,255,0.5); font-size: 0.75rem;">${providerIcon} ${provider.charAt(0).toUpperCase() + provider.slice(1)}</p>
                        </div>
                        ${!isCurrentAccount ? `<button onclick="removeAccount('${provider}', '${account.email}')" style="background: rgba(230, 57, 70, 0.2); color: #e63946; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(230, 57, 70, 0.3); cursor: pointer;">🗑️</button>` : ''}
                    </div>
                </div>
            `;
        });
    });
    
    modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #1d3557, #29537a); border-radius: 1rem; padding: 2rem; max-width: 500px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); max-height: 90vh; overflow-y: auto;">
            <h3 style="color: white; font-weight: 700; font-size: 1.25rem; margin-bottom: 1.5rem; text-align: center;">⚙️ Manage Connected Accounts</h3>
            
            <div style="margin-bottom: 1.5rem;">
                ${accountsHTML || '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 2rem;">No accounts connected yet</p>'}
            </div>
            
            <button onclick="closeManageAccounts()" style="width: 100%; background: rgba(69, 123, 157, 0.2); color: #457b9d; padding: 0.875rem; border-radius: 0.75rem; border: 1px solid rgba(69, 123, 157, 0.3); font-weight: 600; cursor: pointer;">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    if (typeof gsap !== 'undefined') {
        gsap.fromTo(modal.querySelector('div'), 
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }
}

// Remove account
function removeAccount(provider, email) {
    if (confirm(`Remove this ${provider} account?\n${email}`)) {
        const savedAccounts = JSON.parse(localStorage.getItem('etips_accounts') || '{}');
        
        if (savedAccounts[provider]) {
            savedAccounts[provider] = savedAccounts[provider].filter(acc => acc.email !== email);
            
            if (savedAccounts[provider].length === 0) {
                delete savedAccounts[provider];
            }
            
            localStorage.setItem('etips_accounts', JSON.stringify(savedAccounts));
            
            closeManageAccounts();
            showSuccessToast('Account removed successfully');
        }
    }
}

// Close manage accounts
function closeManageAccounts() {
    const modal = document.getElementById('manageAccountsModal');
    if (!modal) return;
    
    if (typeof gsap !== 'undefined') {
        gsap.to(modal.querySelector('div'), {
            scale: 0.8,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            onComplete: () => modal.remove()
        });
    } else {
        modal.remove();
    }
}

// Update Google Login to save account
const originalLoginWithGoogle = loginWithGoogle;
function loginWithGoogle() {
    showLoadingToast('Connecting to Google...');
    
    setTimeout(() => {
        const mockGoogleUser = {
            id: 'google_' + Date.now(),
            name: 'Google User',
            email: 'user@gmail.com',
            avatar: 'https://ui-avatars.com/api/?name=Google+User&background=4285F4&color=fff&size=128',
            provider: 'google',
            loginTime: new Date().toISOString()
        };
        
        completeLogin(mockGoogleUser);
        saveAccountToList('google', mockGoogleUser);
    }, 1500);
}

// Update Facebook Login to save account
const originalLoginWithFacebook = loginWithFacebook;
function loginWithFacebook() {
    showLoadingToast('Connecting to Facebook...');
    
    setTimeout(() => {
        const mockFacebookUser = {
            id: 'facebook_' + Date.now(),
            name: 'Facebook User',
            email: 'user@facebook.com',
            avatar: 'https://ui-avatars.com/api/?name=Facebook+User&background=1877F2&color=fff&size=128',
            provider: 'facebook',
            loginTime: new Date().toISOString()
        };
        
        completeLogin(mockFacebookUser);
        saveAccountToList('facebook', mockFacebookUser);
    }, 1500);
}

// Update showUserProfile to show provider info
const originalShowUserProfile = showUserProfile;
function showUserProfile() {
    document.getElementById('loginPrompt').style.display = 'none';
    
    const profileDiv = document.getElementById('userProfile');
    profileDiv.style.display = 'block';
    
    document.getElementById('userAvatar').src = currentUser.avatar;
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    
    // Show provider info
    const providerIcons = {
        'google': '🔵',
        'facebook': '📘',
        'twitter': '✖️',
        'apple': '🍎'
    };
    
    const providerNames = {
        'google': 'Google',
        'facebook': 'Facebook',
        'twitter': 'X (Twitter)',
        'apple': 'Apple'
    };
    
    document.getElementById('providerIcon').textContent = providerIcons[currentUser.provider] || '🔗';
    document.getElementById('providerName').textContent = providerNames[currentUser.provider] || currentUser.provider;
    
    document.getElementById('addTipForm').style.display = 'block';
    
    if (typeof gsap !== 'undefined') {
        gsap.fromTo(profileDiv, 
            { opacity: 0, y: -20 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
        );
        gsap.fromTo(document.getElementById('addTipForm'), 
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.5, delay: 0.2, ease: 'power2.out' }
        );
    }
}

// Google Login
function loginWithGoogle() {
    // Show loading state
    showLoadingToast('Connecting to Google...');
    
    // Simulate OAuth flow (In production, use Google OAuth 2.0)
    setTimeout(() => {
        // Mock user data - In production, this comes from Google OAuth
        const mockGoogleUser = {
            id: 'google_' + Date.now(),
            name: 'Google User',
            email: 'user@gmail.com',
            avatar: 'https://ui-avatars.com/api/?name=Google+User&background=4285F4&color=fff&size=128',
            provider: 'google',
            loginTime: new Date().toISOString()
        };
        
        // In production, you would:
        // 1. Redirect to Google OAuth consent screen
        // 2. Get authorization code
        // 3. Exchange code for access token
        // 4. Get user profile from Google API
        // 5. Create session in your backend
        
        completeLogin(mockGoogleUser);
    }, 1500);
}

// Facebook Login
function loginWithFacebook() {
    // Show loading state
    showLoadingToast('Connecting to Facebook...');
    
    // Simulate OAuth flow (In production, use Facebook Login SDK)
    setTimeout(() => {
        // Mock user data - In production, this comes from Facebook SDK
        const mockFacebookUser = {
            id: 'facebook_' + Date.now(),
            name: 'Facebook User',
            email: 'user@facebook.com',
            avatar: 'https://ui-avatars.com/api/?name=Facebook+User&background=1877F2&color=fff&size=128',
            provider: 'facebook',
            loginTime: new Date().toISOString()
        };
        
        // In production, you would:
        // 1. Initialize Facebook SDK
        // 2. Call FB.login() with required permissions
        // 3. Get user profile from Facebook Graph API
        // 4. Create session in your backend
        
        completeLogin(mockFacebookUser);
    }, 1500);
}

// Complete login process
function completeLogin(userData) {
    currentUser = userData;
    
    // Save to localStorage
    localStorage.setItem('etips_user', JSON.stringify(userData));
    
    // Update UI
    showUserProfile();
    
    // Show success message
    showSuccessToast(`Welcome, ${userData.name}! 👋`);
    
    // Load community tips
    loadCommunityTips();
}

// Show user profile after login
function showUserProfile() {
    // Hide login prompt
    document.getElementById('loginPrompt').style.display = 'none';
    
    // Show user profile
    const profileDiv = document.getElementById('userProfile');
    profileDiv.style.display = 'block';
    
    // Update profile info
    document.getElementById('userAvatar').src = currentUser.avatar;
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    
    // Show add tip form
    document.getElementById('addTipForm').style.display = 'block';
    
    // Animate entrance
    if (typeof gsap !== 'undefined') {
        gsap.fromTo(profileDiv, 
            { opacity: 0, y: -20 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
        );
        gsap.fromTo(document.getElementById('addTipForm'), 
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.5, delay: 0.2, ease: 'power2.out' }
        );
    }
}

// Logout user
function logoutUser() {
    // Clear user data
    currentUser = null;
    localStorage.removeItem('etips_user');
    
    // Reset UI
    document.getElementById('loginPrompt').style.display = 'block';
    document.getElementById('userProfile').style.display = 'none';
    document.getElementById('addTipForm').style.display = 'none';
    document.getElementById('tipContent').value = '';
    document.getElementById('charCount').textContent = '0 / 500 characters';
    
    // Show message
    showSuccessToast('Signed out successfully');
    
    // Reload tips
    loadCommunityTips();
}

// Character counter for tip textarea
document.addEventListener('DOMContentLoaded', function() {
    const tipContent = document.getElementById('tipContent');
    if (tipContent) {
        tipContent.addEventListener('input', function() {
            const count = this.value.length;
            document.getElementById('charCount').textContent = `${count} / 500 characters`;
        });
    }
    
    // Check user session on page load
    checkUserSession();
});

// Post community tip
function postCommunityTip() {
    if (!currentUser) {
        showErrorToast('Please sign in to post a tip');
        return;
    }
    
    const content = document.getElementById('tipContent').value.trim();
    
    if (!content) {
        showErrorToast('Please write a tip before posting');
        return;
    }
    
    if (content.length < 10) {
        showErrorToast('Tip must be at least 10 characters long');
        return;
    }
    
    // Create new tip object
    const newTip = {
        id: 'tip_' + Date.now(),
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        content: content,
        timestamp: new Date().toISOString(),
        likes: 0,
        likedBy: []
    };
    
    // Add to tips array
    communityTips.unshift(newTip);
    
    // Save to localStorage
    localStorage.setItem('etips_community_tips', JSON.stringify(communityTips));
    
    // Clear form
    document.getElementById('tipContent').value = '';
    document.getElementById('charCount').textContent = '0 / 500 characters';
    
    // Reload tips display
    loadCommunityTips();
    
    // Show success message
    showSuccessToast('Your tip has been posted! 🎉');
    
    // Scroll to tips list
    setTimeout(() => {
        document.getElementById('communityTipsList').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
}

// Load community tips from localStorage
function loadCommunityTips() {
    const savedTips = localStorage.getItem('etips_community_tips');
    if (savedTips) {
        communityTips = JSON.parse(savedTips);
    }
    
    displayCommunityTips();
}

// Display community tips
function displayCommunityTips() {
    const tipsList = document.getElementById('communityTipsList');
    
    if (communityTips.length === 0) {
        tipsList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem; opacity: 0.5;">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p style="font-size: 0.9375rem;">No community tips yet. Be the first to share!</p>
            </div>
        `;
        return;
    }
    
    // Generate HTML for all tips
    let tipsHTML = '';
    communityTips.forEach(tip => {
        const timeAgo = formatTimeAgo(tip.timestamp);
        const isLiked = currentUser && tip.likedBy.includes(currentUser.id);
        const canDelete = currentUser && tip.userId === currentUser.id;
        
        tipsHTML += `
            <div class="community-tip-card" style="background: rgba(255, 255, 255, 0.05); border-radius: 1rem; padding: 1.25rem; border: 1px solid rgba(255, 255, 255, 0.1);">
                <!-- User Info -->
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                    <img src="${tip.userAvatar}" alt="${tip.userName}" style="width: 2.5rem; height: 2.5rem; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.2);">
                    <div style="flex: 1;">
                        <h5 style="color: white; font-weight: 700; font-size: 0.9375rem; margin-bottom: 0.125rem;">${tip.userName}</h5>
                        <p style="color: rgba(255,255,255,0.5); font-size: 0.8125rem;">${timeAgo}</p>
                    </div>
                    ${canDelete ? `
                        <button onclick="deleteTip('${tip.id}')" style="background: rgba(230, 57, 70, 0.2); color: #e63946; padding: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(230, 57, 70, 0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    ` : ''}
                </div>
                
                <!-- Tip Content -->
                <p style="color: rgba(255,255,255,0.9); font-size: 0.9375rem; line-height: 1.7; margin-bottom: 1rem;">
                    ${tip.content}
                </p>
                
                <!-- Actions -->
                <div style="display: flex; align-items: center; gap: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                    <button onclick="likeTip('${tip.id}')" style="background: ${isLiked ? 'rgba(230, 57, 70, 0.2)' : 'transparent'}; color: ${isLiked ? '#e63946' : 'rgba(255,255,255,0.6)'}; padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid ${isLiked ? 'rgba(230, 57, 70, 0.3)' : 'rgba(255, 255, 255, 0.2)'}; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 600; transition: all 0.3s ease;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <span>${tip.likes} ${tip.likes === 1 ? 'Like' : 'Likes'}</span>
                    </button>
                    
                    <button style="background: transparent; color: rgba(255,255,255,0.6); padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 600;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                        </svg>
                        <span>Helpful</span>
                    </button>
                </div>
            </div>
        `;
    });
    
    tipsList.innerHTML = tipsHTML;
}

// Like a tip
function likeTip(tipId) {
    if (!currentUser) {
        showErrorToast('Please sign in to like tips');
        return;
    }
    
    const tip = communityTips.find(t => t.id === tipId);
    if (!tip) return;
    
    const likedIndex = tip.likedBy.indexOf(currentUser.id);
    
    if (likedIndex > -1) {
        // Unlike
        tip.likedBy.splice(likedIndex, 1);
        tip.likes--;
    } else {
        // Like
        tip.likedBy.push(currentUser.id);
        tip.likes++;
    }
    
    // Save to localStorage
    localStorage.setItem('etips_community_tips', JSON.stringify(communityTips));
    
    // Reload display
    displayCommunityTips();
}

// Delete a tip
function deleteTip(tipId) {
    if (!currentUser) return;
    
    const tipIndex = communityTips.findIndex(t => t.id === tipId);
    if (tipIndex === -1) return;
    
    const tip = communityTips[tipIndex];
    if (tip.userId !== currentUser.id) {
        showErrorToast('You can only delete your own tips');
        return;
    }
    
    // Confirm deletion
    if (confirm('Are you sure you want to delete this tip?')) {
        communityTips.splice(tipIndex, 1);
        
        // Save to localStorage
        localStorage.setItem('etips_community_tips', JSON.stringify(communityTips));
        
        // Reload display
        displayCommunityTips();
        
        showSuccessToast('Tip deleted successfully');
    }
}

// Format timestamp to relative time
function formatTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return past.toLocaleDateString();
}

// Toast notification functions
function showLoadingToast(message) {
    showToast(message, 'rgba(69, 123, 157, 0.95)', '⏳');
}

function showSuccessToast(message) {
    showToast(message, 'rgba(42, 157, 143, 0.95)', '✅');
}

function showErrorToast(message) {
    showToast(message, 'rgba(230, 57, 70, 0.95)', '❌');
}

function showToast(message, bgColor, icon) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 2rem;
        left: 50%;
        transform: translateX(-50%);
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.2);
        max-width: 90%;
    `;
    
    toast.innerHTML = `
        <span style="font-size: 1.25rem;">${icon}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Animate entrance
    if (typeof gsap !== 'undefined') {
        gsap.fromTo(toast,
            { y: -100, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }
        );
    }
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to(toast, {
                y: -100,
                opacity: 0,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => toast.remove()
            });
        } else {
            toast.remove();
        }
    }, 3000);
}
