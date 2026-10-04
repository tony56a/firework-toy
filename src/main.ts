import './ui/styles.css';
import { App } from './app';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;
new App(canvas, uiRoot).start();
