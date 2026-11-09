// Projeção do custo de Pollard rho: ~1,25·√q iterações com q ≈ 2^(bits−1). Em log10, porque 2^2047 não cabe num double.
export function projectYears(bits, rate) {
  return ((bits - 1) / 2) * Math.log10(2) + Math.log10(1.25) - Math.log10(rate) - Math.log10(31557600)
}

export function fmtYears(log10Years) {
  if (log10Years < 0) return `${(10 ** log10Years * 365.25).toFixed(1)} dias`
  if (log10Years < 6) return `${Math.round(10 ** log10Years).toLocaleString('pt-BR')} anos`
  return `10^${log10Years.toFixed(0)} anos`
}
