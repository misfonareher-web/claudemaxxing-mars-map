export function scoreStyle(f){return {weight:.3,fillOpacity:.6,fillColor:f.properties.excluded||f.properties.score===null?'#888':`hsl(${f.properties.score*1.2} 70% 45%)`};}
