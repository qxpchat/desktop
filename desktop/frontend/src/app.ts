import { mount } from 'svelte';
import App from './shell/App.svelte';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/theme.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

mount(App, { target });
