import {api} from './api.js';
export function requestRoute(preset,profile,weights,points){return api('route',{preset,profile,weights,from:points[0],to:points[1]});}
