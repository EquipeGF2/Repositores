/**
 * Serviço de Geocodificação Multi-Provider
 * Busca coordenadas em cascata: Google Maps → Nominatim (OSM)
 */

// Configuração da API (definir em variável de ambiente)
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

/**
 * Faz uma requisição HTTP com timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Parseia o endereço no formato "CIDADE • RUA, NÚMERO, BAIRRO"
 */
function parseEndereco(endereco) {
  if (!endereco || typeof endereco !== 'string') {
    return { cidade: '', rua: '', numero: '', bairro: '', original: endereco };
  }

  let cidade = '';
  let ruaCompleta = '';

  // Detectar separador: • ou -
  if (endereco.includes('•')) {
    const partes = endereco.split('•').map(p => p.trim());
    cidade = partes[0];
    ruaCompleta = partes[1] || '';
  } else if (endereco.includes(' - ')) {
    const partes = endereco.split(' - ').map(p => p.trim());
    cidade = partes[0];
    ruaCompleta = partes.slice(1).join(', ');
  } else {
    ruaCompleta = endereco;
  }

  // Limpar cidade (remover UF se tiver)
  if (cidade.includes('/')) {
    cidade = cidade.split('/')[0].trim();
  }

  // Extrair componentes: "RUA NOME, NÚMERO, BAIRRO"
  const partesRua = ruaCompleta.split(',').map(p => p.trim());

  return {
    cidade,
    rua: partesRua[0] || '',
    numero: partesRua[1] || '',
    bairro: partesRua[2] || '',
    original: endereco
  };
}

/**
 * Geocodifica usando Google Maps API (mais preciso)
 * @returns {Object|null} { lat, lng, fonte, precisao, cidade, bairro }
 */
async function geocodeGoogle(endereco) {
  if (!GOOGLE_API_KEY) {
    console.log('⚠️ Google Maps API key não configurada');
    return null;
  }

  const parsed = parseEndereco(endereco);

  // Montar endereço para Google (formato: rua numero, bairro, cidade, estado, país)
  let query = '';
  if (parsed.rua) {
    query = parsed.rua;
    if (parsed.numero) query += ' ' + parsed.numero;
    if (parsed.bairro) query += ', ' + parsed.bairro;
  }
  if (parsed.cidade) query += ', ' + parsed.cidade;
  query += ', RS, Brasil';

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&region=br&language=pt-BR`;

  try {
    console.log(`🔍 Google Maps: ${query}`);
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;

      // Determinar precisão baseado no location_type
      let precisao = 'endereco';
      const locationType = result.geometry.location_type;
      if (locationType === 'ROOFTOP') precisao = 'endereco';
      else if (locationType === 'RANGE_INTERPOLATED') precisao = 'rua';
      else if (locationType === 'GEOMETRIC_CENTER') precisao = 'bairro';
      else precisao = 'cidade';

      console.log(`✅ Google Maps OK: ${result.formatted_address} (${precisao})`);

      return {
        lat: location.lat,
        lng: location.lng,
        fonte: 'google',
        precisao,
        cidade: parsed.cidade,
        bairro: parsed.bairro,
        enderecoFormatado: result.formatted_address
      };
    }

    console.log(`❌ Google Maps: ${data.status} - ${data.error_message || 'Sem resultados'}`);
    return null;
  } catch (error) {
    console.error('❌ Google Maps erro:', error.message);
    return null;
  }
}

/**
 * Geocodifica usando Nominatim (OpenStreetMap) - Gratuito e ilimitado
 * @returns {Object|null} { lat, lng, fonte, precisao, cidade, bairro }
 */
async function geocodeNominatim(endereco) {
  const parsed = parseEndereco(endereco);

  // Estratégias de busca em cascata
  const estrategias = [];

  // 1. Endereço completo
  if (parsed.rua && parsed.cidade) {
    let busca = parsed.rua;
    if (parsed.numero) busca += ' ' + parsed.numero;
    if (parsed.bairro) busca += ', ' + parsed.bairro;
    busca += ', ' + parsed.cidade + ', RS, Brasil';
    estrategias.push({ query: busca, precisao: 'endereco' });
  }

  // 2. Rua + Cidade (sem número e bairro)
  if (parsed.rua && parsed.cidade) {
    estrategias.push({
      query: `${parsed.rua}, ${parsed.cidade}, RS, Brasil`,
      precisao: 'rua'
    });
  }

  // 3. Bairro + Cidade
  if (parsed.bairro && parsed.cidade) {
    estrategias.push({
      query: `${parsed.bairro}, ${parsed.cidade}, RS, Brasil`,
      precisao: 'bairro'
    });
  }

  // 4. Apenas cidade
  if (parsed.cidade) {
    estrategias.push({
      query: `${parsed.cidade}, RS, Brasil`,
      precisao: 'cidade'
    });
  }

  for (const estrategia of estrategias) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(estrategia.query)}&format=json&limit=1&countrycodes=br`;

    try {
      console.log(`🔍 Nominatim (${estrategia.precisao}): ${estrategia.query}`);

      const response = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'GermaniRepositores/1.0' }
      });
      const data = await response.json();

      if (data && data.length > 0) {
        console.log(`✅ Nominatim OK: ${data[0].display_name} (${estrategia.precisao})`);

        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          fonte: 'nominatim',
          precisao: estrategia.precisao,
          cidade: parsed.cidade,
          bairro: parsed.bairro,
          enderecoFormatado: data[0].display_name
        };
      }
    } catch (error) {
      console.error(`❌ Nominatim erro (${estrategia.precisao}):`, error.message);
    }

    // Pequeno delay entre requisições para respeitar rate limit
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('❌ Nominatim: Nenhuma estratégia funcionou');
  return null;
}

/**
 * Geocodifica um endereço usando múltiplos providers em cascata
 * Ordem: Google Maps → Nominatim
 * @param {string} endereco - Endereço a geocodificar
 * @returns {Object|null} - Coordenadas ou null se falhar
 */
export async function geocodificarEndereco(endereco) {
  if (!endereco || typeof endereco !== 'string') {
    return null;
  }

  console.log(`\n📍 Geocodificando: ${endereco}`);

  // 1. Tentar Google Maps (mais preciso)
  const resultGoogle = await geocodeGoogle(endereco);
  if (resultGoogle) {
    return resultGoogle;
  }

  // 2. Fallback: Nominatim (gratuito)
  const resultNominatim = await geocodeNominatim(endereco);
  if (resultNominatim) {
    return resultNominatim;
  }

  console.log('❌ Falha total na geocodificação');
  return null;
}

/**
 * Verifica se as APIs estão configuradas
 */
export function getApiStatus() {
  return {
    google: !!GOOGLE_API_KEY,
    nominatim: true // Sempre disponível
  };
}

export default {
  geocodificarEndereco,
  getApiStatus,
  parseEndereco
};
