/**
 * Static lat/lon centroids for every district in the Syngenta dataset.
 * Used to fetch weather and NDVI data without needing GPS on retailers.
 */
export const DISTRICT_COORDS: Record<string, { lat: number; lon: number; state: string }> = {
  'Agra':         { lat: 27.18, lon: 78.01, state: 'Uttar Pradesh' },
  'Ahmedabad':    { lat: 23.03, lon: 72.58, state: 'Gujarat' },
  'Akola':        { lat: 20.71, lon: 77.00, state: 'Maharashtra' },
  'Amravati':     { lat: 20.93, lon: 77.75, state: 'Maharashtra' },
  'Amritsar':     { lat: 31.63, lon: 74.87, state: 'Punjab' },
  'Bardhaman':    { lat: 23.24, lon: 87.86, state: 'West Bengal' },
  'Bathinda':     { lat: 30.21, lon: 74.95, state: 'Punjab' },
  'Bharatpur':    { lat: 27.22, lon: 77.49, state: 'Rajasthan' },
  'Bikaner':      { lat: 28.02, lon: 73.31, state: 'Rajasthan' },
  'Hisar':        { lat: 29.15, lon: 75.72, state: 'Haryana' },
  'Indore':       { lat: 22.72, lon: 75.86, state: 'Madhya Pradesh' },
  'Jaipur':       { lat: 26.91, lon: 75.79, state: 'Rajasthan' },
  'Jalgaon':      { lat: 21.00, lon: 75.56, state: 'Maharashtra' },
  'Kalaburagi':   { lat: 17.33, lon: 76.82, state: 'Karnataka' },
  'Kanpur Nagar': { lat: 26.46, lon: 80.33, state: 'Uttar Pradesh' },
  'Karnal':       { lat: 29.69, lon: 76.99, state: 'Haryana' },
  'Lucknow':      { lat: 26.85, lon: 80.95, state: 'Uttar Pradesh' },
  'Ludhiana':     { lat: 30.91, lon: 75.85, state: 'Punjab' },
  'Meerut':       { lat: 28.98, lon: 77.71, state: 'Uttar Pradesh' },
  'Mehsana':      { lat: 23.60, lon: 72.38, state: 'Gujarat' },
  'Muzaffarpur':  { lat: 26.12, lon: 85.36, state: 'Bihar' },
  'Nadia':        { lat: 23.47, lon: 88.56, state: 'West Bengal' },
  'Patiala':      { lat: 30.34, lon: 76.40, state: 'Punjab' },
  'Patna':        { lat: 25.59, lon: 85.13, state: 'Bihar' },
  'Rajkot':       { lat: 22.30, lon: 70.80, state: 'Gujarat' },
  'Ratlam':       { lat: 23.33, lon: 75.04, state: 'Madhya Pradesh' },
  'Rohtak':       { lat: 28.89, lon: 76.61, state: 'Haryana' },
  'Sehore':       { lat: 23.20, lon: 77.08, state: 'Madhya Pradesh' },
  'Sikar':        { lat: 27.61, lon: 75.14, state: 'Rajasthan' },
  'Sirsa':        { lat: 29.53, lon: 75.02, state: 'Haryana' },
  'Ujjain':       { lat: 23.18, lon: 75.77, state: 'Madhya Pradesh' },
  'Varanasi':     { lat: 25.32, lon: 83.00, state: 'Uttar Pradesh' },
  'Vijayapura':   { lat: 16.83, lon: 75.72, state: 'Karnataka' },
};

export function getCoordsForDistrict(district: string) {
  return DISTRICT_COORDS[district] ?? null;
}
