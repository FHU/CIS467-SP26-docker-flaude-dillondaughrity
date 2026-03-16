// Import the ENTIRE lodash library
import capitalize from 'lodash-es'
import reverse from 'lodash-es'

// But only use one tiny function
// const name = capitalize('hello world')
// const name2 = reverse('hello world')

// Scroll reveal
const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(el => {
        if (el.isIntersecting) {
            el.target.classList.add('visible');
            observer.unobserve(el.target);
        }
    });
}, { threshold: 0.12 });
revealEls.forEach(el => observer.observe(el));

// Sticky nav shadow
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.style.boxShadow = window.scrollY > 12
        ? '0 2px 20px rgba(0,0,0,0.07)'
        : 'none';
});

// Mobile menu
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
document.querySelectorAll('.mobile-menu a').forEach(a =>
    a.addEventListener('click', () => mobileMenu.classList.remove('open'))
);

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});
