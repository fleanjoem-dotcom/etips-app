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

    // ── Bottom nav visibility ──────────────────────────────────────────
    // Landing page is a clean splash screen → NO bottom nav
    // All main app screens → show bottom nav
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        if (viewName === 'landing' || viewName === undefined) {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';   // match CSS definition
        }
    }
    // ──────────────────────────────────────────────────────────────────

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
        window.earthquakes = earthquakes; // Share with AI function
        
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
                <h3 style="color: #1a1a1a; font-weight: 700; font-size: 1.25rem; margin-bottom: 0.5rem;">All Clear</h3>
                <p style="color: #4a4a4a; font-size: 0.875rem;">No active warnings or alerts at this time. Stay prepared!</p>
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
                    <span style="color: #555555; font-size: 0.75rem;">${formatTime(alert.timestamp)}</span>
                </div>
                
                <div style="display: flex; align-items: start; gap: 1rem;">
                    <div style="width: 3rem; height: 3rem; background: rgba(${alert.severity === 'critical' || alert.severity === 'high' ? '230, 57, 70' : alert.severity === 'medium' || alert.severity === 'warning' ? '252, 191, 73' : alert.severity === 'info' ? '69, 123, 157' : '42, 157, 143'}, 0.2); border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2">
                            ${iconSvg}
                        </svg>
                    </div>
                    <div style="flex: 1;">
                        <h3 style="color: #1a1a1a; font-weight: 600; margin-bottom: 0.5rem; font-size: 1rem;">${alert.title}</h3>
                        <p style="color: #4a4a4a; font-size: 0.875rem; line-height: 1.5; margin-bottom: 0.5rem;">${alert.message}</p>
                        ${alert.location ? `<p style="color: #555555; font-size: 0.75rem;">&#x1F4CD; ${alert.location}</p>` : ''}
                    </div>
                </div>
                
                <!-- Expandable AI Analysis Section -->
                <div class="alert-details" id="alert-details-${alert.id}" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                    ${alert.earthquakeData ? `
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
                            <div style="background: rgba(0,0,0,0.04); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: #555555; font-size: 0.75rem; margin-bottom: 0.25rem;">Magnitude</p>
                                <p style="color: #1a1a1a; font-weight: 600; font-size: 0.9375rem;">${alert.earthquakeData.magnitude}</p>
                            </div>
                            <div style="background: rgba(0,0,0,0.04); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: #555555; font-size: 0.75rem; margin-bottom: 0.25rem;">Distance</p>
                                <p style="color: #1a1a1a; font-weight: 600; font-size: 0.9375rem;">${alert.earthquakeData.distance.toFixed(1)} km</p>
                            </div>
                            <div style="background: rgba(0,0,0,0.04); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: #555555; font-size: 0.75rem; margin-bottom: 0.25rem;">Depth</p>
                                <p style="color: #1a1a1a; font-weight: 600; font-size: 0.9375rem;">${alert.earthquakeData.depth} km</p>
                            </div>
                            <div style="background: rgba(0,0,0,0.04); padding: 0.75rem; border-radius: 0.5rem;">
                                <p style="color: #555555; font-size: 0.75rem; margin-bottom: 0.25rem;">Risk Level</p>
                                <p style="color: #1a1a1a; font-weight: 600; font-size: 0.9375rem; text-transform: capitalize;">${alert.earthquakeData.riskLevel}</p>
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- AI Risk Assessment Button -->
                    <button class="ai-assessment-btn-card" onclick="event.stopPropagation(); ${alert.earthquakeData ? `performRiskAssessmentForQuake('${alert.earthquakeData.id}')` : 'performRiskAssessment()'}" style="width: 100%; background: linear-gradient(135deg, var(--etips-orange), var(--etips-red)); color: white; padding: 0.875rem; border-radius: 0.5rem; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(247, 127, 0, 0.3);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                        <span>🤖 AI Risk Analysis</span>
                    </button>
                </div>
            </div>
            
            <!-- Expand/Collapse Icon -->
            <div class="expand-icon" id="alert-icon-${alert.id}" style="position: absolute; bottom: 0.75rem; right: 0.75rem; color: #888888; transition: transform 0.3s ease;">
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
    const alertList = [];
    const now = new Date();
    const STALE_MS = 48 * 60 * 60 * 1000; // 48 hours = 2 days

    if (!earthquakes || earthquakes.length === 0) return alertList;

    // Only consider earthquakes within 48 hours
    const fresh = earthquakes.filter(q => (now - new Date(q.timestamp)) <= STALE_MS);

    if (fresh.length === 0) {
        // Nothing recent — show monitoring card
        alertList.push({
            id: 'monitoring-clear',
            type: 'info',
            severity: 'info',
            title: '✅ No Recent Earthquakes — System Monitoring',
            message: 'No earthquakes detected in the past 48 hours near your area. The app is actively watching USGS data and will notify you instantly when a new event is detected.',
            timestamp: new Date().toISOString(),
            location: null,
            earthquakeData: null
        });
        return alertList;
    }

    // ── Always pin the NEAREST fresh earthquake first ─────────────────────────
    const nearest = fresh.reduce((a, b) => a.distance < b.distance ? a : b);
    const nearestLabel = nearest.magnitude >= 5.0 ? 'Strong'
                       : nearest.magnitude >= 4.0 ? 'Moderate'
                       : nearest.magnitude >= 3.0 ? 'Minor' : 'Weak';
    const nearestSeverity = nearest.riskLevel === 'high' ? 'critical'
                          : nearest.riskLevel === 'medium' ? 'warning' : 'info';

    alertList.push({
        id: `eq-${nearest.id}`,
        type: 'earthquake',
        severity: nearestSeverity,
        title: `📍 Nearest Earthquake — ${nearestLabel} (M${nearest.magnitude})`,
        message: `M${nearest.magnitude} earthquake detected ${nearest.distance.toFixed(1)}km from your location at ${nearest.location}. Depth: ${nearest.depth}km. ${nearest.magnitude >= 4.5 ? 'Drop, Cover, and Hold On!' : 'Stay alert and be prepared.'}`,
        timestamp: nearest.timestamp,
        location: nearest.location,
        earthquakeData: nearest
    });

    // ── Additional alerts for other fresh earthquakes ─────────────────────────
    fresh.forEach(quake => {
        if (quake.id === nearest.id) return; // skip — already added
        const hoursAgo = (now - new Date(quake.timestamp)) / (1000 * 60 * 60);

        // Earthquake detection alert (M4.0+ or very close)
        if (quake.magnitude >= 4.0 || quake.distance < 10) {
            alertList.push({
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

        // Aftershock warning (M4.0+ within 12 hours)
        if (quake.magnitude >= 4.0 && hoursAgo < 12) {
            alertList.push({
                id: `aftershock-${quake.id}`,
                type: 'aftershock',
                severity: 'warning',
                title: 'Aftershock Warning',
                message: `Following the M${quake.magnitude} earthquake at ${quake.location}, aftershocks may occur in the next 24-48 hours. Stay alert and keep emergency supplies ready.`,
                timestamp: new Date(new Date(quake.timestamp).getTime() + 15 * 60000).toISOString(),
                location: quake.location,
                earthquakeData: quake
            });
        }

        // Evacuation notice (high-risk within 6 hours)
        if (quake.riskLevel === 'high' && hoursAgo < 6) {
            alertList.push({
                id: `evac-${quake.id}`,
                type: 'evacuation',
                severity: 'info',
                title: 'Evacuation Centers Available',
                message: 'Tupi Municipal Gymnasium and Barangay Hall are open for shelter, food, water, and medical assistance.',
                timestamp: new Date(new Date(quake.timestamp).getTime() + 30 * 60000).toISOString(),
                location: 'Tupi Municipal Gymnasium, Barangay Hall',
                earthquakeData: quake
            });
        }
    });

    // Nearest stays first; rest sorted newest-first
    const [first, ...rest] = alertList;
    rest.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return [first, ...rest];
}


// AI Risk Assessment for a specific earthquake — calls dedicated single-quake endpoint
async function performRiskAssessmentForQuake(quakeId) {
    const quake = earthquakes.find(q => q.id === quakeId);
    if (!quake) return;

    const loadingModal = document.getElementById('loading-modal');
    loadingModal.classList.remove('hidden');
    const loadingTitle = loadingModal.querySelector('.loading-title');
    const loadingText = loadingModal.querySelector('.loading-text');
    loadingTitle.textContent = `Analyzing M${quake.magnitude} Earthquake...`;
    loadingText.textContent = `AI is analyzing M${quake.magnitude} at ${quake.location} (${quake.distance.toFixed(1)}km away)...`;

    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#loading-modal .modal-content',
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }

    try {
        // Call real Gemini AI endpoint
        const ctx = earthquakes.filter(q => q.id !== quakeId).slice(0, 5)
            .map(q => ({ magnitude: q.magnitude, location: q.location, distance: q.distance, depth: q.depth }));

        const [aiRes, ruleRes] = await Promise.all([
            fetch('/api/ai-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quake: { magnitude: quake.magnitude, location: quake.location,
                             depth: quake.depth, distance: quake.distance,
                             timestamp: quake.timestamp, riskLevel: quake.riskLevel },
                    contextQuakes: ctx, activeAlerts: window.alerts || []
                })
            }),
            fetch(`/api/risk-assessment/${encodeURIComponent(quakeId)}`)
        ]);

        const aiData = await aiRes.json();
        const assessment = await ruleRes.json();

        // Attach Gemini analysis to assessment object
        if (aiData.success) {
            assessment.geminiAnalysis = aiData.analysis;
            assessment.aiSource = aiData.source;
            assessment.aiModel = aiData.model;
        }

        setTimeout(() => {
            if (typeof gsap !== 'undefined') {
                gsap.to('#loading-modal .modal-content', {
                    scale: 0.8, opacity: 0, duration: 0.3, ease: 'power2.in',
                    onComplete: () => {
                        loadingModal.classList.add('hidden');
                        showRiskAssessment(assessment, quake);
                    }
                });
            } else {
                loadingModal.classList.add('hidden');
                showRiskAssessment(assessment, quake);
            }
        }, 1200);
    } catch (error) {
        console.error('Error performing AI risk assessment:', error);
        loadingModal.classList.add('hidden');
    }
}

// ── Real Gemini AI Analysis ───────────────────────────────────────────────────
async function analyzeWithRealAI(quake, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(247,127,0,0.12),rgba(230,57,70,0.08));
                    border:1px solid rgba(247,127,0,0.3);border-radius:0.75rem;
                    padding:1rem;margin-top:0.75rem;">
            <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem;">
                <span style="color:#f77f00;font-weight:700;font-size:0.8rem;">🤖 E-TIPS AI is analyzing...</span>
            </div>
            <div style="height:4px;background:rgba(247,127,0,0.15);border-radius:2px;overflow:hidden;">
                <div style="height:100%;background:linear-gradient(90deg,#f77f00,#e63946);
                            border-radius:2px;width:60%;animation:aiProg 1.5s ease-in-out infinite;"></div>
            </div>
        </div>
        <style>@keyframes aiProg{0%{margin-left:-60%}100%{margin-left:100%}}</style>`;
    try {
        const ctx = (window.earthquakes||[]).filter(q=>q.id!==quake.id).slice(0,5)
            .map(q=>({magnitude:q.magnitude,location:q.location,distance:q.distance,depth:q.depth}));
        const res = await fetch('/api/ai-analyze',{method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({quake:{magnitude:quake.magnitude,location:quake.location,
                depth:quake.depth,distance:quake.distance,timestamp:quake.timestamp,
                riskLevel:quake.riskLevel},contextQuakes:ctx,activeAlerts:window.alerts||[]})});
        const d = await res.json();
        if(d.success){
            const isG = d.source==='gemini';
            const badge = isG
                ? `<span style="background:linear-gradient(135deg,#4285f4,#0f9d58);color:#fff;font-size:0.6rem;font-weight:700;padding:0.1rem 0.45rem;border-radius:999px;margin-left:0.4rem;">✨ Gemini AI</span>`
                : `<span style="background:rgba(247,127,0,0.2);color:#f77f00;font-size:0.6rem;font-weight:700;padding:0.1rem 0.45rem;border-radius:999px;margin-left:0.4rem;">E-TIPS Engine</span>`;
            const fmt = (d.analysis||'')
                .replace(/🔍 SITUATION ASSESSMENT/g,'<div class="ais-h">🔍 Situation Assessment</div>')
                .replace(/⚠️ IMMEDIATE ACTIONS/g,'<div class="ais-h" style="color:#e63946;">⚠️ Immediate Actions</div>')
                .replace(/🏠 WHAT TO EXPECT/g,'<div class="ais-h" style="color:#457b9d;">🏠 What to Expect</div>')
                .replace(/✅ YOU ARE SAFE WHEN/g,'<div class="ais-h" style="color:#2a9d8f;">✅ You Are Safe When</div>')
                .replace(/💡 PREPAREDNESS TIP/g,'<div class="ais-h" style="color:#6a4c93;">💡 Preparedness Tip</div>')
                .replace(/^• (.+)$/gm,'<div style="display:flex;gap:0.35rem;margin:0.15rem 0;"><span style="color:#f77f00;">▸</span><span>$1</span></div>')
                .replace(/\n\n/g,'<br>').replace(/\n/g,'<br>');
            container.innerHTML=`
                <div style="background:linear-gradient(135deg,rgba(247,127,0,0.08),rgba(230,57,70,0.04));
                            border:1px solid rgba(247,127,0,0.22);border-radius:0.75rem;
                            padding:1rem;margin-top:0.75rem;font-size:0.81rem;line-height:1.65;">
                    <div style="display:flex;align-items:center;margin-bottom:0.6rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(247,127,0,0.15);">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f77f00" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                        <span style="color:#f77f00;font-weight:700;font-size:0.78rem;margin-left:0.4rem;">E-TIPS AI Analysis</span>${badge}
                    </div>
                    <div style="color:#1a1a1a;">${fmt}</div>
                </div>
                <style>.ais-h{font-weight:700;color:#c0392b;margin-top:0.65rem;margin-bottom:0.25rem;font-size:0.79rem;}</style>`;
        }
    } catch(e) {
        container.innerHTML=`<div style="color:#e63946;font-size:0.78rem;padding:0.5rem;text-align:center;">⚠️ AI analysis unavailable.</div>`;
    }
}

function autoAnalyzeNearest(quakeList) {
    if(!quakeList||quakeList.length===0) return;
    const nearest = quakeList.reduce((a,b)=>a.distance<b.distance?a:b);
    const panelId = 'auto-ai-panel-'+nearest.id;
    setTimeout(()=>analyzeWithRealAI(nearest, panelId), 900);
}

// Load alerts — now dynamically derived from live USGS earthquake data
async function loadAlerts() {
    try {
        const response = await fetch('/api/alerts');
        alerts = await response.json();
        
        // Count unread alerts (any non-info alert that is unread)
        const unreadCount = alerts.filter(a => !a.isRead && a.severity !== 'info').length;
        const badge = document.getElementById('notification-count');
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
        } else {
            // Still show total if any alerts exist
            const totalActive = alerts.filter(a => a.severity !== 'info').length;
            if (totalActive > 0) {
                badge.textContent = totalActive;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
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

// Enhanced AI Risk Assessment — full area analysis of ALL earthquakes
async function performRiskAssessment() {
    const loadingModal = document.getElementById('loading-modal');
    loadingModal.classList.remove('hidden');

    const loadingTitle = loadingModal.querySelector('.loading-title');
    const loadingText  = loadingModal.querySelector('.loading-text');
    loadingTitle.textContent = 'AI Analyzing All Seismic Activity...';
    loadingText.textContent  = `Scanning ${earthquakes.length} earthquake events, cross-referencing live alerts, and generating individual risk scores for each event.`;

    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#loading-modal .modal-content',
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }

    try {
        const response = await fetch('/api/risk-assessment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userLocation)
        });
        const assessment = await response.json();

        setTimeout(() => {
            if (typeof gsap !== 'undefined') {
                gsap.to('#loading-modal .modal-content', {
                    scale: 0.8, opacity: 0, duration: 0.3, ease: 'power2.in',
                    onComplete: () => {
                        loadingModal.classList.add('hidden');
                        showRiskAssessment(assessment, null);
                    }
                });
            } else {
                loadingModal.classList.add('hidden');
                showRiskAssessment(assessment, null);
            }
        }, 2500);
    } catch (error) {
        console.error('Error performing risk assessment:', error);
        loadingModal.classList.add('hidden');
    }
}

// Show risk assessment modal — works for both single-quake and full-area assessments
function showRiskAssessment(assessment, focusQuake) {
    const modal   = document.getElementById('risk-modal');
    const content = document.getElementById('risk-content');

    const riskClass = assessment.level === 'high' ? 'risk-high' :
                     assessment.level === 'medium' ? 'risk-medium' : 'risk-low';
    const bgColor   = assessment.level === 'high' ? 'rgba(230, 57, 70, 0.1)' :
                     assessment.level === 'medium' ? 'rgba(252, 191, 73, 0.1)' : 'rgba(42, 157, 143, 0.1)';
    const textColor = assessment.level === 'high' ? '#e63946' :
                     assessment.level === 'medium' ? '#fcbf49' : '#2a9d8f';

    // ── Gemini AI Panel (shown at top when available) ────────────────────
    let geminiPanel = '';
    if (assessment.geminiAnalysis) {
        const isGemini = assessment.aiSource === 'gemini';
        const srcBadge = isGemini
            ? `<span style="background:linear-gradient(135deg,#4285f4,#0f9d58);color:#fff;font-size:0.6rem;font-weight:700;padding:0.1rem 0.5rem;border-radius:999px;margin-left:0.5rem;">✨ Gemini AI</span>`
            : `<span style="background:rgba(247,127,0,0.2);color:#f77f00;font-size:0.6rem;font-weight:700;padding:0.1rem 0.5rem;border-radius:999px;margin-left:0.5rem;">E-TIPS Engine</span>`;
        const fmt = assessment.geminiAnalysis
            .replace(/🔍 SITUATION ASSESSMENT/g,'<div class="grh">🔍 Situation Assessment</div>')
            .replace(/⚠️ IMMEDIATE ACTIONS/g,'<div class="grh" style="color:#e63946;">⚠️ Immediate Actions</div>')
            .replace(/🏠 WHAT TO EXPECT/g,'<div class="grh" style="color:#457b9d;">🏠 What to Expect</div>')
            .replace(/✅ YOU ARE SAFE WHEN/g,'<div class="grh" style="color:#2a9d8f;">✅ You Are Safe When</div>')
            .replace(/💡 PREPAREDNESS TIP/g,'<div class="grh" style="color:#6a4c93;">💡 Preparedness Tip</div>')
            .replace(/^• (.+)$/gm,'<div style="display:flex;gap:0.35rem;margin:0.15rem 0;"><span style="color:#f77f00;flex-shrink:0;">▸</span><span>$1</span></div>')
            .replace(/\n\n/g,'<br>').replace(/\n/g,'<br>');
        geminiPanel = `
            <div style="background:linear-gradient(135deg,rgba(247,127,0,0.08),rgba(230,57,70,0.05));
                        border:1.5px solid rgba(247,127,0,0.25);border-radius:0.875rem;
                        padding:1.1rem;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;margin-bottom:0.7rem;padding-bottom:0.6rem;border-bottom:1px solid rgba(247,127,0,0.15);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f77f00" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    <span style="color:#f77f00;font-weight:700;font-size:0.82rem;margin-left:0.45rem;">E-TIPS AI Analysis</span>${srcBadge}
                </div>
                <div style="color:#1a1a1a;font-size:0.82rem;line-height:1.65;">${fmt}</div>
            </div>
            <style>.grh{font-weight:700;color:#c0392b;margin-top:0.65rem;margin-bottom:0.25rem;font-size:0.8rem;}</style>`;
    }

    // ── Header: focused quake info (single-quake mode) ──────────────────
    let focusHeader = '';
    if (focusQuake) {
        focusHeader = `
            <div style="background: ${bgColor}; border: 2px solid ${textColor}; border-radius: 0.75rem; padding: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 1rem;">
                <div style="background: ${textColor}; color: white; border-radius: 0.75rem; padding: 0.5rem 1rem; text-align: center; min-width: 4rem;">
                    <div style="font-size: 1.5rem; font-weight: 700;">${focusQuake.magnitude}</div>
                    <div style="font-size: 0.7rem;">MAG</div>
                </div>
                <div style="flex: 1;">
                    <p style="font-weight: 700; color: var(--etips-textDark); font-size: 1rem;">${focusQuake.location}</p>
                    <p style="color: #6c757d; font-size: 0.8rem;">${focusQuake.distance.toFixed(1)}km away · ${focusQuake.depth}km deep · ${formatTime(focusQuake.timestamp)}</p>
                    ${assessment.confidence !== undefined ? `<p style="color: #6c757d; font-size: 0.75rem; margin-top: 0.25rem;">AI Confidence: <strong style="color: ${textColor}">${assessment.confidence}%</strong></p>` : ''}
                </div>
            </div>`;
    }


    // ── Risk factors bars ───────────────────────────────────────────────
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
            </div>`;
    });

    // ── Action items ────────────────────────────────────────────────────
    let actionsHTML = '';
    if (assessment.detailedActions && assessment.detailedActions.length) {
        actionsHTML = '<div style="margin-top: 1rem;"><h4 style="font-weight: 600; margin-bottom: 0.75rem; color: var(--etips-textDark);">📋 Action Items:</h4><ul style="list-style: none; padding: 0;">';
        assessment.detailedActions.forEach((action, index) => {
            actionsHTML += `<li style="padding: 0.5rem; background: #f8f9fa; border-radius: 0.5rem; margin-bottom: 0.5rem; font-size: 0.875rem; animation: slideIn 0.3s ease ${0.5 + index * 0.1}s both;">${action}</li>`;
        });
        actionsHTML += '</ul></div>';
    }

    // ── AI insights grid ────────────────────────────────────────────────
    let insightsHTML = '';
    if (assessment.insights) {
        const ins = assessment.insights;
        const extraCells = ins.activeAlerts !== undefined ? `
            <div>
                <p style="color: #6c757d; margin-bottom: 0.25rem;">🚨 Active Alerts</p>
                <p style="font-weight: 600; color: #e63946;">${ins.activeAlerts} total (${ins.criticalAlerts || 0} critical, ${ins.warningAlerts || 0} warning)</p>
            </div>
            <div>
                <p style="color: #6c757d; margin-bottom: 0.25rem;">⬆ Alert Risk Boost</p>
                <p style="font-weight: 600; color: #f77f00;">+${ins.alertBoost || 0} pts applied</p>
            </div>` : (ins.alertsTriggered !== undefined ? `
            <div>
                <p style="color: #6c757d; margin-bottom: 0.25rem;">🚨 Alerts Triggered</p>
                <p style="font-weight: 600; color: #e63946;">${ins.alertsTriggered} (${ins.criticalAlerts || 0} critical, ${ins.warningAlerts || 0} warning)</p>
            </div>
            <div>
                <p style="color: #6c757d; margin-bottom: 0.25rem;">⬆ Alert Boost</p>
                <p style="font-weight: 600; color: #f77f00;">+${ins.alertBoost || 0} pts</p>
            </div>` : '');

        insightsHTML = `
            <div style="margin-top: 1rem; padding: 1rem; background: rgba(69,123,157,0.1); border-radius: 0.75rem; border-left: 4px solid #457b9d;">
                <h4 style="font-weight: 600; margin-bottom: 0.75rem; color: var(--etips-textDark);">📊 AI Insights:</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; font-size: 0.875rem;">
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">Trend</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${ins.trend}</p>
                    </div>
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">Next Review</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${ins.nextReview}</p>
                    </div>
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">Preparedness</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${ins.preparednessLevel}</p>
                    </div>
                    <div>
                        <p style="color: #6c757d; margin-bottom: 0.25rem;">${ins.nearbyEvents !== undefined ? 'Nearby Events' : 'Aftershock Risk'}</p>
                        <p style="font-weight: 600; color: var(--etips-textDark);">${ins.nearbyEvents !== undefined ? ins.nearbyEvents : ins.aftershockProbability}</p>
                    </div>
                    ${extraCells}
                </div>
                <p style="margin-top: 0.75rem; font-size: 0.8rem; color: #6c757d; font-style: italic;">${ins.recommendation}</p>
            </div>`;
    }

    // ── Per-earthquake breakdown table (full-area mode only) ────────────
    let breakdownHTML = '';
    if (assessment.earthquakeBreakdown && assessment.earthquakeBreakdown.length) {
        const levelColor = (l) => l === 'high' ? '#e63946' : l === 'medium' ? '#fcbf49' : '#2a9d8f';
        const levelBg    = (l) => l === 'high' ? 'rgba(230,57,70,0.1)' : l === 'medium' ? 'rgba(252,191,73,0.1)' : 'rgba(42,157,143,0.1)';
        let rows = '';
        assessment.earthquakeBreakdown.forEach((q, i) => {
            const lc = levelColor(q.level);
            const lb = levelBg(q.level);
            rows += `
                <div style="background: ${lb}; border: 1px solid ${lc}; border-radius: 0.75rem; padding: 0.875rem; animation: slideIn 0.3s ease ${i * 0.08}s both;">
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                        <div style="background: ${lc}; color: white; border-radius: 0.5rem; padding: 0.25rem 0.6rem; font-size: 0.9rem; font-weight: 700; min-width: 2.5rem; text-align: center;">M${q.magnitude}</div>
                        <div style="flex:1;">
                            <p style="font-weight: 600; color: var(--etips-textDark); font-size: 0.875rem; margin-bottom: 0.1rem;">${q.quakeLocation}</p>
                            <p style="color: #6c757d; font-size: 0.75rem;">${q.distance.toFixed(1)}km away · ${formatTime(q.timestamp)}</p>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.1rem; font-weight: 700; color: ${lc};">Score: ${q.score}</div>
                            <div style="font-size: 0.7rem; font-weight: 600; color: ${lc}; text-transform: uppercase;">${q.level} risk</div>
                            <div style="font-size: 0.65rem; color: #6c757d;">Conf: ${q.confidence}%</div>
                        </div>
                    </div>
                    <p style="font-size: 0.78rem; color: #4a4a4a; line-height: 1.5;">${q.recommendation}</p>
                    <button onclick="event.stopPropagation(); closeRiskModal(); performRiskAssessmentForQuake('${q.quakeId}')" 
                        style="margin-top: 0.5rem; background: linear-gradient(135deg,${lc},${lc}cc); color:white; border:none; padding:0.4rem 0.85rem; border-radius:0.4rem; font-size:0.75rem; font-weight:600; cursor:pointer;">
                        🤖 Full Analysis
                    </button>
                </div>`;
        });
        breakdownHTML = `
            <div style="margin-top: 1.25rem;">
                <h4 style="font-weight: 700; margin-bottom: 0.75rem; color: var(--etips-textDark); display:flex; align-items:center; gap:0.5rem;">
                    🌍 Individual AI Assessment — All ${assessment.earthquakeBreakdown.length} Earthquakes
                </h4>
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">${rows}</div>
            </div>`;
    }

    content.innerHTML = `
        ${geminiPanel}
        ${focusHeader}
        <div class="risk-score-container" style="background-color: ${bgColor}; animation: scaleIn 0.5s ease both;">
            <div class="risk-score" style="color: ${textColor};">${assessment.score}</div>
            <div class="risk-level-badge ${riskClass}">${assessment.level.toUpperCase()} RISK</div>
        </div>
        <div class="risk-factors">${factorsHTML}</div>
        <div class="risk-recommendation" style="animation: slideIn 0.3s ease 0.3s both;">
            <p><span>Summary:</span> ${assessment.recommendation}</p>
        </div>
        ${actionsHTML}
        ${insightsHTML}
        ${breakdownHTML}
    `;

    modal.classList.remove('hidden');
    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#risk-modal .modal-content',
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)' }
        );
    }
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
    
    // ── Update nearest event card (only show if within 48 hours) ──────────────
    const STALE_HOURS = 48; // 2 days
    const now48 = new Date();

    // Find the nearest earthquake within the last 48 hours
    const recentNearby = earthquakes.filter(q => {
        const hrs = (now48 - new Date(q.timestamp)) / (1000 * 60 * 60);
        return hrs <= STALE_HOURS;
    });

    const nearest48 = recentNearby.length > 0
        ? recentNearby.reduce((a, b) => a.distance < b.distance ? a : b)
        : null;

    if (nearest48) {
        const nearest = nearest48;
        console.log('Updating nearest earthquake card with:', nearest);

        document.getElementById('nearest-location-home').textContent = nearest.location;
        document.getElementById('nearest-distance-home').textContent = `${nearest.distance.toFixed(1)} km away`;
        document.getElementById('nearest-magnitude-home').textContent = `Magnitude ${nearest.magnitude}`;
        document.getElementById('nearest-time-home').textContent = formatTime(nearest.timestamp);
        document.getElementById('nearest-depth-home').textContent = `${nearest.depth} km deep`;

        const riskBorderColor = nearest.riskLevel === 'high' ? '#e63946' :
                               nearest.riskLevel === 'medium' ? '#fcbf49' : '#2a9d8f';
        const riskBgColor = nearest.riskLevel === 'high' ? 'rgba(230,57,70,0.2)' :
                           nearest.riskLevel === 'medium' ? 'rgba(252,191,73,0.2)' : 'rgba(42,157,143,0.2)';
        const riskClass = nearest.riskLevel === 'high' ? 'risk-high' :
                         nearest.riskLevel === 'medium' ? 'risk-medium' : 'risk-low';

        document.getElementById('nearest-risk-badge-home').innerHTML =
            `<div style="background:${riskBgColor};border:2px solid ${riskBorderColor};border-radius:0.75rem;padding:0.75rem 1rem;text-align:center;min-width:80px;">
                <div style="font-size:1.5rem;font-weight:700;color:${riskBorderColor};line-height:1;">${nearest.magnitude}</div>
                <div style="font-size:0.625rem;color:${riskBorderColor};text-transform:uppercase;letter-spacing:0.05em;margin-top:0.25rem;font-weight:600;">Magnitude</div>
                <div class="risk-badge ${riskClass}" style="margin-top:0.5rem;font-size:0.625rem;padding:0.25rem 0.5rem;">${nearest.riskLevel.toUpperCase()}</div>
            </div>`;

        // Make nearest-event-card clickable — navigates to alerts
        const card = document.getElementById('nearest-event-card-home');
        if (card) card.onclick = () => showNearestEarthquakeAlert();

        console.log('✅ Nearest earthquake card updated successfully!');
    } else {
        // No earthquakes within 48 hours — show monitoring state
        console.log('ℹ️ No earthquakes within 48 hours — showing monitoring state');
        document.getElementById('nearest-location-home').textContent = 'No Recent Earthquakes';
        document.getElementById('nearest-distance-home').textContent = 'System is actively monitoring';
        document.getElementById('nearest-magnitude-home').textContent = 'All Clear';
        document.getElementById('nearest-time-home').textContent = 'Waiting for new data';
        document.getElementById('nearest-depth-home').textContent = 'You will be notified instantly';
        document.getElementById('nearest-risk-badge-home').innerHTML =
            `<div style="background:rgba(42,157,143,0.15);border:2px solid #2a9d8f;border-radius:0.75rem;padding:0.75rem 1rem;text-align:center;min-width:80px;">
                <div style="font-size:1.6rem;line-height:1;">✅</div>
                <div style="font-size:0.6rem;color:#2a9d8f;text-transform:uppercase;font-weight:700;margin-top:0.3rem;">Safe</div>
            </div>`;
        // Card still navigates to alerts — shows the monitoring state there too
        const card = document.getElementById('nearest-event-card-home');
        if (card) card.onclick = () => showView('alerts');
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
                <h3 style="color: #1a1a1a; font-weight: 600; font-size: 1rem; margin-bottom: 0.75rem; padding-left: 0.5rem; border-left: 4px solid var(--etips-red);">
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
                            <h4 style="color: #1a1a1a; font-weight: 600; margin-bottom: 0.25rem;">${tip.title}</h4>
                            <p style="color: #4a4a4a; font-size: 0.875rem; line-height: 1.5;">${tip.description}</p>
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
        <h3 style="color: #1a1a1a; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.5rem;">👥 Safety Reminders from the Community</h3>
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
                        <span style="color: #555555; font-size: 0.875rem; font-weight: 600;">${reminder.badge}</span>
                    </div>
                    <h4 style="color: #1a1a1a; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.75rem;">${reminder.title}</h4>
                    <p style="color: #333333; font-size: 0.9375rem; line-height: 1.7;">
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
        <h3 style="color: #1a1a1a; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.5rem;">🔔 Regular Maintenance Reminders</h3>
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
                    <h4 style="color: #1a1a1a; font-weight: 600; margin-bottom: 0.25rem;">${reminder.title}</h4>
                    <p style="color: #4a4a4a; font-size: 0.875rem; line-height: 1.5;">${reminder.description}</p>
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
                <p style="color: #4a4a4a; font-size: 0.875rem; line-height: 1.5; margin-bottom: 0.75rem;">${drill.description}</p>
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
                    <h4 style="color: #1a1a1a; font-weight: 700; font-size: 1rem; margin-bottom: 0.5rem;">${step.title}</h4>
                    <p style="color: #333333; font-size: 0.875rem; line-height: 1.6; margin-bottom: 0.5rem;">${step.description}</p>
                    <div style="background: rgba(247, 127, 0, 0.1); border-left: 3px solid var(--etips-orange); padding: 0.5rem 0.75rem; border-radius: 0.5rem;">
                        <p style="color: #333333; font-size: 0.8125rem;">💡 <strong>Tip:</strong> ${step.tip}</p>
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
            <p style="color: #333333; font-size: 0.875rem; line-height: 1.5;">⚠️ ${note}</p>
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
            <h3 style="color: #1a1a1a; font-weight: 700; font-size: 1.125rem; display: flex; align-items: center; gap: 0.5rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--etips-red)" stroke-width="2">
                    <path d="M20 7h-9"></path>
                    <path d="M14 17H5"></path>
                    <circle cx="17" cy="17" r="3"></circle>
                    <circle cx="7" cy="7" r="3"></circle>
                </svg>
                ${category.category}
            </h3>
            <p style="color: #4a4a4a; font-size: 0.875rem; margin-top: 0.25rem;">${category.items.length} items</p>
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
                            <h4 style="color: #1a1a1a; font-weight: 600; font-size: 0.9375rem;">${item.name}</h4>
                            <span style="background: ${priorityBg}; color: ${priorityColor}; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;">
                                ${item.priority}
                            </span>
                        </div>
                        <p style="color: #4a4a4a; font-size: 0.875rem; margin-bottom: 0.25rem;">
                            <strong style="color: var(--etips-orange);">Quantity:</strong> ${item.quantity}
                        </p>
                        <p style="color: #555555; font-size: 0.8125rem; font-style: italic;">
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
            
            <div style="background: rgba(255, 255, 255, 0.08); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.12);">
                <p style="color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.06em;">Calling</p>
                <p style="color: white; font-weight: 700; font-size: 1.125rem; margin-bottom: 0.4rem;">${contactName}</p>
                <p style="color: #e63946; font-weight: 600; font-size: 1rem; letter-spacing: 0.02em;">${displayNumber}</p>
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

// ─────────────────────────────────────────────────────────────────────────────
// MISSING BUTTON FIXES
// ─────────────────────────────────────────────────────────────────────────────

// -- 1. Nearest Earthquake Card (Home page) --
function showNearestEarthquakeAlert() {
    if (!earthquakes || earthquakes.length === 0) {
        showView('alerts');
        return;
    }
    // Find the nearest within 48 hours, else fall back to globally nearest
    const now = new Date();
    const fresh = earthquakes.filter(q => (now - new Date(q.timestamp)) <= 48 * 60 * 60 * 1000);
    const nearest = fresh.length > 0
        ? fresh.reduce((a, b) => a.distance < b.distance ? a : b)
        : earthquakes.reduce((a, b) => a.distance < b.distance ? a : b);

    // Navigate to Alerts page first
    showView('alerts');

    // After alerts render, find and highlight the matching card
    setTimeout(() => {
        // Use querySelectorAll and filter by data attribute to avoid CSS selector issues
        const allDetails = document.querySelectorAll('[id^="alert-details-eq-"]');
        let targetCard = null;
        allDetails.forEach(el => {
            if (el.id.includes(nearest.id) || el.id === `alert-details-eq-${nearest.id}`) {
                targetCard = el.closest('.earthquake-card');
            }
        });
        // Fallback: grab the first earthquake card if ID match fails
        if (!targetCard) {
            targetCard = document.querySelector('.earthquake-card');
        }
        if (targetCard) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetCard.style.border = '3px solid #f77f00';
            targetCard.style.boxShadow = '0 0 30px rgba(247,127,0,0.6)';
            targetCard.click();
            setTimeout(() => {
                targetCard.style.border = '';
                targetCard.style.boxShadow = '';
            }, 3000);
        }
    }, 600);
}


// ── 3. Community Category Navigation ─────────────────────────────────────────
const communityPages = ['safety-tips-page', 'reminders-page', 'drill-tutorials-page', 'emergency-kit-page', 'drill-detail-page'];

function showCommunityCategory(category) {
    // Hide main community page content
    document.getElementById('community-main').classList.add('hidden');
    communityPages.forEach(p => {
        const el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });

    const pageMap = {
        'safety-tips':    'safety-tips-page',
        'reminders':      'reminders-page',
        'drill-tutorials':'drill-tutorials-page',
        'emergency-kit':  'emergency-kit-page'
    };
    const pageId = pageMap[category];
    if (!pageId) return;

    const page = document.getElementById(pageId);
    if (page) {
        page.classList.remove('hidden');
        // Populate content
        populateCategoryPage(category);
    }
}

function backToCommunityMain() {
    communityPages.forEach(p => {
        const el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });
    document.getElementById('community-main').classList.remove('hidden');
}

function backToDrillTutorials() {
    const detail = document.getElementById('drill-detail-page');
    if (detail) detail.classList.add('hidden');
    const list = document.getElementById('drill-tutorials-page');
    if (list) list.classList.remove('hidden');
}

// ── 4. Populate community sub-pages with content ──────────────────────────────
function populateCategoryPage(category) {
    if (category === 'safety-tips') {
        const tips = [
            { icon: '🏠', title: 'Secure Your Home', body: 'Anchor bookshelves, water heaters, and heavy appliances to walls with straps or bolts. This prevents them from toppling during shaking.' },
            { icon: '🎒', title: 'Build a 72-Hour Kit', body: 'Prepare a bag with water (1 gal/person/day), non-perishable food, first aid kit, flashlight, batteries, radio, and copies of documents.' },
            { icon: '📍', title: 'Identify Safe Spots', body: 'In each room, locate a sturdy table or desk to shelter under. Know which walls are load-bearing. Avoid windows and exterior walls.' },
            { icon: '👨‍👩‍👧‍👦', title: 'Make a Family Plan', body: 'Agree on two meeting points: one near your home and one outside your neighborhood. Share emergency contacts with all family members.' },
            { icon: '🔁', title: 'Practice DROP-COVER-HOLD', body: 'Monthly drills build muscle memory. DROP to hands and knees, COVER your head and neck under a table, HOLD ON until shaking stops.' },
            { icon: '⚡', title: 'Know Your Utilities', body: 'Learn how to shut off gas, water, and electricity. Keep a wrench near the gas meter. Teach all adults in your household.' },
            { icon: '📻', title: 'Battery-Powered Radio', body: 'Keep a battery or hand-crank radio for emergency broadcasts when power and internet are down after a major earthquake.' },
            { icon: '💊', title: 'Medication & First Aid', body: 'Keep at least a 7-day supply of critical medications. Your first aid kit should include bandages, antiseptic, pain relievers, and gloves.' }
        ];
        document.getElementById('safety-tips-list').innerHTML = tips.map((t, i) => `
            <div style="background: rgba(220,20,60,0.06); border: 1px solid rgba(220,20,60,0.15); border-radius: 0.75rem; padding: 1rem; margin-bottom: 0.75rem; display: flex; gap: 1rem; align-items: flex-start;">
                <div style="font-size: 1.75rem; line-height: 1; flex-shrink: 0;">${t.icon}</div>
                <div>
                    <h4 style="color: #1a1a1a; font-weight: 700; margin-bottom: 0.4rem;">${i + 1}. ${t.title}</h4>
                    <p style="color: #4a4a4a; font-size: 0.875rem; line-height: 1.6;">${t.body}</p>
                </div>
            </div>`).join('');
    }

    if (category === 'reminders') {
        // Each reminder image has its own full card with title, body, and tips
        const reminderCards = [
            {
                src: '/static/images/reminder-1.jpg',
                badge: 'Reminder #1',
                title: '🎒 Build Your Emergency Go-Bag',
                body: 'Every household should have a ready-to-grab emergency bag with at least 72 hours of supplies. Store it near your exit door so you can grab it immediately when evacuating.',
                tips: ['Pack water, food, first aid, flashlight, and radio', 'Include copies of IDs and important documents', 'Review and replenish every 6 months']
            },
            {
                src: '/static/images/reminder-2.jpg',
                badge: 'Reminder #2',
                title: '🔁 Practice DROP, COVER, HOLD ON',
                body: 'The single most important thing you can do in an earthquake is DROP to the ground, take COVER under a sturdy table, and HOLD ON until shaking stops. Practice this with your whole family every month.',
                tips: ['Drill monthly so it becomes automatic', 'Identify safe spots in every room', 'Never run outside during shaking']
            },
            {
                src: '/static/images/reminder-3.jpg',
                badge: 'Reminder #3',
                title: '👨‍👩‍👧‍👦 Make a Family Communication Plan',
                body: 'Families are often separated during earthquakes. Agree in advance on two meeting points and a contact person outside your area that everyone can call to check in.',
                tips: ['Choose a local meeting point near your home', 'Choose a second point outside your neighborhood', 'Write the plan on a card and keep it in every family member\'s bag']
            },
            {
                src: '/static/images/reminder-4.jpg',
                badge: 'Reminder #4',
                title: '💧 Store Water & Non-Perishable Food',
                body: 'After a major earthquake, water and food supplies may be disrupted for days. Store at least 1 gallon of water per person per day, and stock non-perishable food for at least 3 days.',
                tips: ['Replace stored water every 6 months', 'Include a manual can opener in your kit', 'Don\'t forget pet food and baby formula if needed']
            },
            {
                src: '/static/images/reminder-5.jpg',
                badge: 'Reminder #5',
                title: '🔩 Secure Heavy Items in Your Home',
                body: 'Most earthquake injuries are caused by falling furniture and objects — not building collapse. Secure bookshelves, water heaters, and heavy appliances to walls using straps or bolts.',
                tips: ['Anchor tall furniture to wall studs', 'Use museum putty to secure small items', 'Move heavy objects to lower shelves']
            },
            {
                src: '/static/images/reminder-6.jpg',
                badge: 'Reminder #6',
                title: '🗺️ Know Your Evacuation Routes',
                body: 'Know at least two ways out of every room and two routes out of your neighborhood. Identify the nearest evacuation center and practice the route on foot and by vehicle.',
                tips: ['Post evacuation maps in common areas', 'Identify the nearest Barangay evacuation center', 'Practice the route with your family at least once a year']
            }
        ];

        const schedules = [
            { month: 'Every Month', items: ['Practice DROP-COVER-HOLD ON drill', 'Check flashlight batteries', 'Verify family emergency contacts'] },
            { month: 'Every 6 Months', items: ['Rotate food and water supplies', 'Check kit expiration dates', 'Review and update evacuation routes', 'Test smoke and CO detectors'] },
            { month: 'Every Year', items: ['Update emergency kit with new needs', 'Re-inspect home for new hazards', 'Review earthquake insurance coverage', 'Re-anchor any moved furniture'] }
        ];

        document.getElementById('reminders-list').innerHTML = `
            <!-- Reminder Cards — one per image -->
            ${reminderCards.map((r, i) => `
                <div style="background: #ffffff; border: 1.5px solid rgba(220,20,60,0.2); border-radius: 1rem; overflow: hidden; margin-bottom: 1.25rem; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
                    <!-- Image -->
                    <div style="width: 100%; height: 180px; overflow: hidden; position: relative; background: rgba(220,20,60,0.06);">
                        <img src="${r.src}" alt="${r.title}"
                             style="width: 100%; height: 100%; object-fit: cover; display: block;"
                             onerror="this.parentElement.style.background='rgba(220,20,60,0.1)'; this.style.display='none';">
                        <div style="position: absolute; top: 0.75rem; left: 0.75rem; background: #DC143C; color: white; font-size: 0.7rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 999px; letter-spacing: 0.03em;">
                            ${r.badge}
                        </div>
                    </div>
                    <!-- Content -->
                    <div style="padding: 1rem;">
                        <h3 style="color: #1a1a1a; font-weight: 700; font-size: 1rem; margin-bottom: 0.5rem; line-height: 1.4;">${r.title}</h3>
                        <p style="color: #4a4a4a; font-size: 0.875rem; line-height: 1.65; margin-bottom: 0.85rem;">${r.body}</p>
                        <div style="background: rgba(220,20,60,0.04); border-left: 3px solid #DC143C; border-radius: 0 0.5rem 0.5rem 0; padding: 0.75rem 1rem;">
                            <p style="color: #DC143C; font-weight: 700; font-size: 0.75rem; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em;">✅ Action Steps</p>
                            <ul style="padding-left: 1.1rem; margin: 0;">
                                ${r.tips.map(tip => `<li style="color: #333; font-size: 0.82rem; line-height: 1.8;">${tip}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                </div>`).join('')}

            <!-- Preparedness Schedule -->
            <h4 style="color: #1a1a1a; font-weight: 700; margin: 0.5rem 0 0.75rem; font-size: 0.95rem;">📅 Preparedness Schedule</h4>
            ${schedules.map(s => `
                <div style="background: rgba(220,20,60,0.06); border: 1px solid rgba(220,20,60,0.15); border-radius: 0.75rem; padding: 1rem; margin-bottom: 0.75rem;">
                    <h4 style="color: #DC143C; font-weight: 700; margin-bottom: 0.5rem; font-size: 0.875rem;">🔔 ${s.month}</h4>
                    <ul style="padding-left: 1.25rem; margin: 0;">
                        ${s.items.map(item => `<li style="color: #4a4a4a; font-size: 0.85rem; line-height: 2;">${item}</li>`).join('')}
                    </ul>
                </div>`).join('')}
        `;
    }

    if (category === 'drill-tutorials') {
        // Each drill card has its own image and full organized layout
        const drills = [
            {
                id: 'drop-cover-hold',
                img: '/static/images/during-earthquake.jpg',
                badge: 'Beginner',
                badgeColor: '#2a9d8f',
                title: 'DROP, COVER, HOLD ON',
                duration: '5 min',
                desc: 'The most critical earthquake response skill for every person. Learn this first.'
            },
            {
                id: 'home-evacuation',
                img: '/static/images/after-earthquake.jpg',
                badge: 'Intermediate',
                badgeColor: '#f77f00',
                title: 'Home Evacuation Drill',
                duration: '15 min',
                desc: 'Practice evacuating your home safely and reaching your designated meeting point.'
            },
            {
                id: 'school-office',
                img: '/static/images/fire-safety-drill.jpg',
                badge: 'Intermediate',
                badgeColor: '#f77f00',
                title: 'School / Office Drill',
                duration: '20 min',
                desc: 'Organized drill procedure for schools, offices, and large public buildings.'
            },
            {
                id: 'car-drill',
                img: '/static/images/before-earthquake.jpg',
                badge: 'Beginner',
                badgeColor: '#2a9d8f',
                title: 'Earthquake in a Vehicle',
                duration: '5 min',
                desc: 'What to do if you are driving when an earthquake strikes your area.'
            }
        ];

        document.getElementById('drill-tutorials-list').innerHTML = drills.map(d => `
            <div onclick="showDrillDetail('${d.id}')"
                 style="background: #ffffff; border: 1.5px solid rgba(220,20,60,0.2); border-radius: 1rem; overflow: hidden; margin-bottom: 1rem; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.07);">
                <div style="position: relative; width: 100%; height: 140px; overflow: hidden; background: rgba(220,20,60,0.06);">
                    <img src="${d.img}" alt="${d.title}" style="width: 100%; height: 100%; object-fit: cover; display: block;"
                         onerror="this.parentElement.style.background='rgba(220,20,60,0.08)'; this.style.display='none';">
                    <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.55));"></div>
                    <div style="position: absolute; top: 0.6rem; left: 0.6rem; background: ${d.badgeColor}; color: white; font-size: 0.68rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 999px;">${d.badge}</div>
                    <div style="position: absolute; top: 0.6rem; right: 0.6rem; background: rgba(0,0,0,0.55); color: white; font-size: 0.68rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 999px;">&#x23f1; ${d.duration}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem;">
                    <div style="flex: 1;">
                        <h4 style="color: #1a1a1a; font-weight: 700; font-size: 0.95rem; margin-bottom: 0.3rem;">${d.title}</h4>
                        <p style="color: #6c757d; font-size: 0.8rem; line-height: 1.45;">${d.desc}</p>
                    </div>
                    <div style="background: rgba(220,20,60,0.08); border-radius: 50%; width: 2.25rem; height: 2.25rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC143C" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                </div>
            </div>`).join('');
    }
    if (category === 'emergency-kit') {
        const kitCategories = [
            {
                icon: '💧', title: 'Water & Food', color: '#1d7ad4',
                bg: 'rgba(29,122,212,0.08)', border: 'rgba(29,122,212,0.25)',
                items: [
                    { img: 'emergency-water.jpg',          label: 'Water',               desc: '1 gallon/person/day — 3-day supply minimum' },
                    { img: 'emergency-food.jpg',           label: 'Non-Perishable Food', desc: '3-day supply of canned or dry goods' },
                    { img: 'emergency-can-opener.jpg',     label: 'Manual Can Opener',   desc: 'Essential for opening canned food' },
                    { img: 'emergency-utensils.jpg',       label: 'Eating Utensils',     desc: 'Plates, cups, spoons for the family' },
                    { img: 'emergency-infant-formula.jpg', label: 'Infant Formula',      desc: 'Baby formula or special dietary needs' }
                ]
            },
            {
                icon: '🏥', title: 'First Aid & Medical', color: '#DC143C',
                bg: 'rgba(220,20,60,0.07)', border: 'rgba(220,20,60,0.22)',
                items: [
                    { img: 'emergency-first-aid-kit.jpg',    label: 'First Aid Kit',       desc: 'Bandages, antiseptic, gauze, and gloves' },
                    { img: 'emergency-pain-relievers.jpg',   label: 'Pain Relievers',      desc: 'Aspirin, ibuprofen, fever reducers' },
                    { img: 'emergency-prescription.jpg',     label: 'Prescription Meds',   desc: '7-day supply of required medications' },
                    { img: 'emergency-medical-supplies.jpg', label: 'Medical Supplies',    desc: 'Thermometer, CPR mask, sterile pads' },
                    { img: 'emergency-ointment.jpg',         label: 'Antiseptic Ointment', desc: 'Neosporin or equivalent for wound care' },
                    { img: 'emergency-eyeglasses.jpg',       label: 'Spare Eyeglasses',    desc: 'Backup pair if you wear corrective lenses' }
                ]
            },
            {
                icon: '🔦', title: 'Tools & Safety', color: '#f77f00',
                bg: 'rgba(247,127,0,0.07)', border: 'rgba(247,127,0,0.25)',
                items: [
                    { img: 'emergency-flashlight.jpg',       label: 'Flashlight',       desc: 'With extra batteries — keep one per room' },
                    { img: 'emergency-batteries.jpg',        label: 'Extra Batteries',  desc: 'AA/AAA batteries for all devices' },
                    { img: 'emergency-radio.jpg',            label: 'Battery Radio',    desc: 'Hand-crank or battery emergency radio' },
                    { img: 'emergency-whistle.jpg',          label: 'Whistle',          desc: 'Signal for help if trapped or lost' },
                    { img: 'emergency-multi-tool.jpg',       label: 'Multi-Tool',       desc: 'Swiss army knife or multi-purpose tool' },
                    { img: 'emergency-plastic-sheeting.jpg', label: 'Plastic Sheeting', desc: 'For emergency shelter-in-place' },
                    { img: 'emergency-duct-tape.jpg',        label: 'Duct Tape',        desc: 'For repairs, sealing, and shelter use' },
                    { img: 'emergency-local-maps.jpg',       label: 'Local Maps',       desc: 'Physical printed maps of your area' },
                    { img: 'emergency-phone-charger.jpg',    label: 'Phone Charger',    desc: 'Backup charger or power bank' }
                ]
            },
            {
                icon: '📄', title: 'Documents & Finance', color: '#457b9d',
                bg: 'rgba(69,123,157,0.08)', border: 'rgba(69,123,157,0.25)',
                items: [
                    { img: 'emergency-important-documents.jpg', label: 'Important Documents', desc: 'Copies of IDs, insurance & vital records' },
                    { img: 'emergency-cash.jpg',                label: 'Cash',                desc: 'Small bills in case ATMs are offline' },
                    { img: 'emergency-contact-list.jpg',        label: 'Contact List',        desc: 'Printed emergency contact list' }
                ]
            },
            {
                icon: '🧼', title: 'Hygiene & Sanitation', color: '#2a9d8f',
                bg: 'rgba(42,157,143,0.07)', border: 'rgba(42,157,143,0.25)',
                items: [
                    { img: 'emergency-soap.jpg',                  label: 'Soap & Hygiene',     desc: 'Hand soap, shampoo, and hygiene basics' },
                    { img: 'emergency-hand-sanitizer.jpg',        label: 'Hand Sanitizer',     desc: 'Alcohol-based hand sanitizer (>=60%)' },
                    { img: 'emergency-toothbrush-toothpaste.jpg', label: 'Toothbrush & Paste', desc: 'One per person plus dental floss' },
                    { img: 'emergency-toilet-paper.jpg',          label: 'Toilet Paper',       desc: 'At least a 3-day supply' },
                    { img: 'emergency-moist-towelettes.jpg',      label: 'Moist Towelettes',   desc: 'Sanitation when water is unavailable' },
                    { img: 'emergency-feminine-hygiene.jpg',      label: 'Feminine Hygiene',   desc: 'Sanitary pads or tampons as needed' },
                    { img: 'emergency-garbage-bags.jpg',          label: 'Garbage Bags',       desc: 'Heavy-duty bags for waste management' }
                ]
            },
            {
                icon: '👕', title: 'Clothing & Comfort', color: '#6d6875',
                bg: 'rgba(109,104,117,0.07)', border: 'rgba(109,104,117,0.22)',
                items: [
                    { img: 'emergency-blanket.jpg',           label: 'Emergency Blanket', desc: 'Thermal mylar blanket per person' },
                    { img: 'emergency-rain-gear.jpg',         label: 'Rain Gear',         desc: 'Ponchos or waterproof jackets' },
                    { img: 'emergency-work-gloves.jpg',       label: 'Work Gloves',       desc: 'Heavy-duty for debris handling' },
                    { img: 'emergency-hat-gloves.jpg',        label: 'Hat & Warm Gloves', desc: 'For cold weather or night conditions' },
                    { img: 'emergency-change-of-clothes.jpg', label: 'Change of Clothes', desc: 'One set per person + sturdy shoes' },
                    { img: 'emergency-pet-food.jpg',          label: 'Pet Food',          desc: '3-day supply of food & water for pets' },
                    { img: 'emergency-entertainment.jpg',     label: 'Entertainment',     desc: 'Books, cards, or activities for children' }
                ]
            }
        ];

        function renderKitItems(items, accentColor) {
            return items.map(item => `
                <label style="cursor:pointer;display:block;">
                    <div style="background:#fff;border:1.5px solid rgba(0,0,0,0.08);border-radius:0.75rem;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.05);">
                        <div style="width:100%;height:88px;overflow:hidden;background:rgba(0,0,0,0.04);">
                            <img src="/static/images/${item.img}" alt="${item.label}"
                                 style="width:100%;height:100%;object-fit:cover;display:block;"
                                 onerror="this.parentElement.style.background='rgba(220,20,60,0.06)';this.style.display='none';">
                        </div>
                        <div style="padding:0.55rem 0.65rem;display:flex;align-items:flex-start;gap:0.45rem;">
                            <input type="checkbox" style="margin-top:0.18rem;accent-color:${accentColor};width:1rem;height:1rem;flex-shrink:0;">
                            <div>
                                <p style="color:#1a1a1a;font-size:0.78rem;font-weight:700;margin-bottom:0.1rem;line-height:1.3;">${item.label}</p>
                                <p style="color:#6c757d;font-size:0.67rem;line-height:1.35;">${item.desc}</p>
                            </div>
                        </div>
                    </div>
                </label>`).join('');
        }

        document.getElementById('emergency-kit-list').innerHTML = `
            <div style="background:rgba(220,20,60,0.06);border:1px solid rgba(220,20,60,0.18);border-radius:0.75rem;padding:0.85rem 1rem;margin-bottom:1.25rem;display:flex;align-items:center;gap:0.75rem;">
                <span style="font-size:1.5rem;flex-shrink:0;">&#x2705;</span>
                <p style="color:#333;font-size:0.82rem;line-height:1.55;">Check off items as you add them to your bag. Aim for at least <strong>72 hours (3-day)</strong> of supplies per person.</p>
            </div>
            ${kitCategories.map(cat => `
                <div style="margin-bottom:1.5rem;">
                    <div style="display:flex;align-items:center;gap:0.6rem;background:${cat.bg};border:1.5px solid ${cat.border};border-radius:0.75rem;padding:0.7rem 1rem;margin-bottom:0.75rem;">
                        <span style="font-size:1.3rem;">${cat.icon}</span>
                        <div style="flex:1;"><h4 style="color:${cat.color};font-weight:700;font-size:0.95rem;margin:0;">${cat.title}</h4></div>
                        <span style="background:${cat.color};color:white;font-size:0.68rem;font-weight:700;padding:0.15rem 0.55rem;border-radius:999px;">${cat.items.length} items</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0.6rem;">
                        ${renderKitItems(cat.items, cat.color)}
                    </div>
                </div>`).join('')}
        `;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
const drillData = {
    'drop-cover-hold': {
        title: 'DROP, COVER, HOLD ON',
        img: '/static/images/during-earthquake.jpg',
        duration: '5 minutes',
        difficulty: 'Beginner',
        description: 'The most important skill for earthquake survival. Practice until it becomes automatic.',
        steps: [
            'DROP to your hands and knees immediately when shaking starts. This prevents being knocked down.',
            'COVER your head and neck with your arms. If a sturdy table or desk is nearby, crawl under it.',
            'HOLD ON to your shelter with one hand. Be prepared to move with it if it shifts.',
            'Stay in position until shaking stops completely. Do not try to run during shaking.',
            'After shaking stops, carefully check for hazards before moving.'
        ],
        notes: ['Do NOT run outside during shaking — most injuries occur from falling debris', 'If in bed, stay there and protect your head with a pillow', 'If outdoors, move away from buildings and stay in the open']
    },
    'home-evacuation': {
        title: 'Home Evacuation Drill',
        img: '/static/images/after-earthquake.jpg',
        duration: '15 minutes',
        difficulty: 'Intermediate',
        description: 'Practice evacuating your home safely and efficiently after a major earthquake.',
        steps: [
            'When shaking stops, shout "EVACUATE!" as the drill signal.',
            'Each family member performs DROP-COVER-HOLD ON first.',
            'Check yourself for injuries before moving.',
            'Walk — never run — to the nearest exit. Avoid using elevators.',
            'Check door frames for damage before opening doors.',
            'Meet at your designated outdoor meeting point (e.g., front gate or street corner).',
            'Account for all family members. Designate a "house captain" to do the count.'
        ],
        notes: ['Practice two exit routes per room in case one is blocked', 'Time your drill — aim for under 3 minutes from signal to meeting point', 'Practice in darkness to simulate night-time emergencies']
    },
    'school-office': {
        title: 'School / Office Drill',
        img: '/static/images/fire-safety-drill.jpg',
        duration: '20 minutes',
        difficulty: 'Intermediate',
        description: 'Structured drill procedure for schools, offices, and public buildings.',
        steps: [
            'Drill coordinator announces: "Earthquake! Take cover!"',
            'All occupants perform DROP-COVER-HOLD ON under desks or against interior walls.',
            'Wait for the "all clear" signal before standing up.',
            'Form a single-file line and follow the designated warden to the exit.',
            'Walk quickly but calmly. Do not use elevators.',
            'Proceed to the assembly area. Stay away from the building.',
            'Warden takes attendance and reports injuries to the coordinator.'
        ],
        notes: ['Post evacuation routes on every floor in clearly visible locations', 'Assign floor wardens and backups', 'Conduct drills at least twice per year — including one unannounced']
    },
    'car-drill': {
        title: 'Earthquake in a Vehicle',
        img: '/static/images/before-earthquake.jpg',
        duration: '5 minutes',
        difficulty: 'Beginner',
        description: 'Know what to do if you are driving when an earthquake strikes.',
        steps: [
            'Gradually slow down and pull over to the right side of the road.',
            'Avoid stopping under overpasses, bridges, trees, signs, or power lines.',
            'Turn on hazard lights. Set the parking brake.',
            'Stay inside the vehicle until shaking stops.',
            'After shaking, check surroundings carefully before driving.',
            'Avoid bridges, ramps, or roads that may be damaged.',
            'Listen to emergency radio for updates and route information.'
        ],
        notes: ['Never stop on or under a bridge during an earthquake', 'If power lines fall on your car, stay inside and call for help', 'Keep a flashlight, water, and first aid kit in your car at all times']
    }
};

function showDrillDetail(drillId) {
    const drill = drillData[drillId];
    if (!drill) return;

    document.getElementById('drill-tutorials-page').classList.add('hidden');
    const detail = document.getElementById('drill-detail-page');
    detail.classList.remove('hidden');

    // Set the header image
    const imgEl = document.getElementById('drill-detail-image');
    if (imgEl && drill.img) {
        imgEl.src = drill.img;
        imgEl.style.opacity = '0.6';
        imgEl.style.display = 'block';
        imgEl.onerror = () => { imgEl.style.display = 'none'; };
    }

    document.getElementById('drill-detail-title').textContent = drill.title;
    document.getElementById('drill-detail-description').textContent = drill.description;
    document.getElementById('drill-detail-duration').textContent = drill.duration;
    document.getElementById('drill-detail-difficulty').textContent = drill.difficulty;

    document.getElementById('drill-detail-steps').innerHTML = drill.steps.map((step, i) => `
        <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 0.875rem; background: rgba(220,20,60,0.05); border-radius: 0.75rem; margin-bottom: 0.75rem; border: 1px solid rgba(220,20,60,0.12);">
            <div style="width: 2rem; height: 2rem; background: #DC143C; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 0.875rem; flex-shrink: 0;">${i + 1}</div>
            <p style="color: #1a1a1a; font-size: 0.9rem; line-height: 1.6; padding-top: 0.2rem;">${step}</p>
        </div>`).join('');

    document.getElementById('drill-detail-notes').innerHTML = drill.notes.map(note => `
        <div style="background: rgba(247,127,0,0.08); border-left: 4px solid #f77f00; border-radius: 0.5rem; padding: 0.875rem; margin-bottom: 0.75rem;">
            <p style="color: #4a4a4a; font-size: 0.875rem; line-height: 1.6;">⚠️ ${note}</p>
        </div>`).join('');
}

// ── 6. Alert card AI Risk button ──────────────────────────────────────────────
// Make sure alert cards created in loadAlerts() have working AI buttons.
// The renderAlerts function generates alert cards with an AI button that calls
// performRiskAssessmentForQuake when earthquakeData is present.
// This patch ensures the alert-level AI button also works.
function triggerAlertAIAssessment(alertId) {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;
    if (alert.earthquakeData && alert.earthquakeData.id) {
        performRiskAssessmentForQuake(alert.earthquakeData.id);
    } else {
        performRiskAssessment();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// E-TIPS NOTIFICATION ENGINE
// Handles: Service Worker, Push Notifications, Vibration, Auto-Polling
// ══════════════════════════════════════════════════════════════════════════════

const ETIPS_NOTIF = {
    SW_REGISTERED: false,
    PERMISSION: 'default',
    LAST_NOTIFIED_ID: localStorage.getItem('etips_last_notified_id') || null,
    POLL_INTERVAL: null,
    VIBRATE_PATTERN_MINOR:   [200, 100, 200],
    VIBRATE_PATTERN_MODERATE:[300, 100, 300, 100, 300],
    VIBRATE_PATTERN_STRONG:  [500, 100, 500, 100, 800, 200, 800]
};

// ── 1. Register Service Worker ────────────────────────────────────────────────
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        ETIPS_NOTIF.SW_REGISTERED = true;
        console.log('[E-TIPS] Service Worker registered:', reg.scope);

        // Listen for messages from SW (e.g. notification click → show alerts)
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data && e.data.type === 'SHOW_ALERTS') showView('alerts');
        });
    } catch (err) {
        console.warn('[E-TIPS] SW registration failed:', err);
    }
}

// ── 2. Request Notification Permission ───────────────────────────────────────
async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        ETIPS_NOTIF.PERMISSION = 'granted';
        return;
    }
    if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        ETIPS_NOTIF.PERMISSION = perm;
        console.log('[E-TIPS] Notification permission:', perm);
    }
}

// ── 3. Vibrate Phone ─────────────────────────────────────────────────────────
function vibrateDevice(magnitude) {
    if (!('vibrate' in navigator)) return;
    if (magnitude >= 5.0)      navigator.vibrate(ETIPS_NOTIF.VIBRATE_PATTERN_STRONG);
    else if (magnitude >= 4.0) navigator.vibrate(ETIPS_NOTIF.VIBRATE_PATTERN_MODERATE);
    else                       navigator.vibrate(ETIPS_NOTIF.VIBRATE_PATTERN_MINOR);
}

// ── 4. Show Browser Notification ─────────────────────────────────────────────
function showEarthquakeNotification(quake) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const severity = quake.magnitude >= 5.0 ? '🚨 STRONG' :
                     quake.magnitude >= 4.0 ? '⚠️ MODERATE' : 'ℹ️ MINOR';
    const title = `${severity} EARTHQUAKE — M${quake.magnitude}`;
    const body  = `📍 ${quake.location}\n` +
                  `📏 ${quake.distance.toFixed(1)}km from you  |  ⬇️ Depth: ${quake.depth}km\n` +
                  `⏱️ ${formatTime(quake.timestamp)}`;

    const options = {
        body,
        icon: '/static/images/icon-192.png',
        badge: '/static/images/icon-192.png',
        tag: 'etips-quake-alert',
        renotify: true,
        requireInteraction: quake.magnitude >= 5.0,
        vibrate: quake.magnitude >= 5.0
            ? ETIPS_NOTIF.VIBRATE_PATTERN_STRONG
            : ETIPS_NOTIF.VIBRATE_PATTERN_MODERATE,
        data: { quakeId: quake.id, url: '/' }
    };

    // Use SW notification when available (works when app is minimized)
    if (ETIPS_NOTIF.SW_REGISTERED && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, options);
        });
    } else {
        // Fallback: browser Notification API
        const n = new Notification(title, options);
        n.onclick = () => { window.focus(); showView('alerts'); n.close(); };
    }

    // Always vibrate device regardless of notification method
    vibrateDevice(quake.magnitude);
    console.log('[E-TIPS] Notification fired for:', quake.id);
}

// ── 5. In-App Alert Banner (visible inside the app) ──────────────────────────
function showInAppAlert(quake) {
    // Remove any existing banner
    const existing = document.getElementById('etips-alert-banner');
    if (existing) existing.remove();

    const color = quake.magnitude >= 5.0 ? '#e63946' :
                  quake.magnitude >= 4.0 ? '#fcbf49' : '#457b9d';
    const textColor = quake.magnitude >= 4.0 && quake.magnitude < 5.0 ? '#1a1a1a' : '#fff';

    const banner = document.createElement('div');
    banner.id = 'etips-alert-banner';
    banner.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:99999;
        background:${color};color:${textColor};
        padding:0.75rem 1rem;display:flex;align-items:center;justify-content:space-between;
        box-shadow:0 4px 20px rgba(0,0,0,0.4);animation:slideDown 0.4s ease;
        font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;
    `;
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.6rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <div>
                <div style="font-weight:700;font-size:0.85rem;">
                    M${quake.magnitude} Earthquake — ${quake.distance.toFixed(1)}km from you
                </div>
                <div style="font-size:0.75rem;opacity:0.9;">${quake.location}</div>
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;">
            <button onclick="showView('alerts');document.getElementById('etips-alert-banner').remove();"
                style="background:rgba(255,255,255,0.25);color:inherit;border:none;padding:0.3rem 0.7rem;
                       border-radius:0.4rem;font-size:0.75rem;font-weight:600;cursor:pointer;">
                View
            </button>
            <button onclick="document.getElementById('etips-alert-banner').remove();"
                style="background:none;border:none;color:inherit;cursor:pointer;font-size:1.1rem;padding:0.2rem;">
                ✕
            </button>
        </div>
        <style>@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}</style>
    `;
    document.body.prepend(banner);

    // Auto-dismiss after 8 seconds for minor, stays for strong
    if (quake.magnitude < 5.0) {
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
    }
}

// ── 6. Check for New Earthquakes (runs every 60 seconds) ─────────────────────
async function checkForNewEarthquakes() {
    try {
        const res = await fetch('/api/earthquakes');
        const freshQuakes = await res.json();
        if (!freshQuakes || freshQuakes.length === 0) return;

        // Update global list
        earthquakes = freshQuakes;
        window.earthquakes = freshQuakes;

        // Only consider earthquakes within 48 hours
        const now = new Date();
        const recent = freshQuakes.filter(q =>
            (now - new Date(q.timestamp)) <= 48 * 60 * 60 * 1000
        );
        if (recent.length === 0) return;

        // Find nearest
        const nearest = recent.reduce((a, b) => a.distance < b.distance ? a : b);

        // Only notify if this is a NEW earthquake (ID not seen before)
        const isNew = nearest.id !== ETIPS_NOTIF.LAST_NOTIFIED_ID;

        // Notify for M3.0+ within 100km OR any M5.0+
        const shouldNotify = isNew && (
            (nearest.magnitude >= 3.0 && nearest.distance <= 100) ||
            nearest.magnitude >= 5.0
        );

        if (shouldNotify) {
            ETIPS_NOTIF.LAST_NOTIFIED_ID = nearest.id;
            localStorage.setItem('etips_last_notified_id', nearest.id);

            // Fire all notifications
            showEarthquakeNotification(nearest);
            showInAppAlert(nearest);

            // Refresh the UI
            renderEarthquakes();
            renderAlerts();

            // Update notification badge
            const badge = document.getElementById('notification-count');
            const current = parseInt(badge.textContent || '0', 10);
            badge.textContent = current + 1;
            badge.classList.remove('hidden');

            console.log('[E-TIPS] NEW earthquake detected and notified:', nearest.id);
        }
    } catch (err) {
        console.warn('[E-TIPS] Earthquake check failed:', err);
    }
}

// ── 7. Bootstrap Notification System ─────────────────────────────────────────
async function initNotificationSystem() {
    await registerServiceWorker();
    await requestNotificationPermission();

    // Start polling every 60 seconds
    if (ETIPS_NOTIF.POLL_INTERVAL) clearInterval(ETIPS_NOTIF.POLL_INTERVAL);
    ETIPS_NOTIF.POLL_INTERVAL = setInterval(checkForNewEarthquakes, 60 * 1000);
    console.log('[E-TIPS] Notification system started. Polling every 60s.');
}

// Auto-start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationSystem);
} else {
    initNotificationSystem();
}
