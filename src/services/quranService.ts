
export interface Surah {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

export interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
  juz: number;
  manzil: number;
  page: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean;
}

export interface Tafseer {
  text: string;
  author: string;
}

class QuranService {
  private baseUrl = 'https://api.alquran.cloud/v1';
  private quranComUrl = 'https://api.quran.com/api/v4';

  async getSurahs(): Promise<Surah[]> {
    try {
      const response = await fetch(`${this.baseUrl}/surah`);
      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error fetching surahs:', error);
      return [];
    }
  }

  async getAyah(surah: number, ayah: number, edition: string = 'quran-uthmani'): Promise<Ayah | null> {
    try {
      const response = await fetch(`${this.baseUrl}/ayah/${surah}:${ayah}/${edition}`);
      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error(`Error fetching ayah ${surah}:${ayah}:`, error);
      return null;
    }
  }

  async getTranslation(surah: number, ayah: number, edition: string = 'en.sahih'): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/ayah/${surah}:${ayah}/${edition}`);
      const data = await response.json();
      return data.data.text;
    } catch (error) {
      console.error(`Error fetching translation for ${surah}:${ayah}:`, error);
      return null;
    }
  }

  async getTafseer(surah: number, ayah: number, tafseerId: number = 169): Promise<Tafseer | null> {
    // Using api.quran.com for Tafseer as it's more comprehensive
    // 169 is usually Tafsir Ibn Kathir (English)
    try {
      const response = await fetch(`${this.quranComUrl}/tafsirs/${tafseerId}/get_by_ayah/${surah}:${ayah}`);
      const data = await response.json();
      return {
        text: data.tafsir.text,
        author: data.tafsir.resource_name
      };
    } catch (error) {
      console.error(`Error fetching tafseer for ${surah}:${ayah}:`, error);
      return null;
    }
  }

  async getSurahAyahs(surahNumber: number, edition: string = 'quran-uthmani'): Promise<Ayah[]> {
    try {
      const response = await fetch(`${this.baseUrl}/surah/${surahNumber}/${edition}`);
      const data = await response.json();
      return data.data.ayahs;
    } catch (error) {
      console.error(`Error fetching ayahs for surah ${surahNumber}:`, error);
      return [];
    }
  }

  async getSurahTranslation(surahNumber: number, edition: string = 'en.sahih'): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/surah/${surahNumber}/${edition}`);
      const data = await response.json();
      return data.data.ayahs.map((a: any) => a.text);
    } catch (error) {
      console.error(`Error fetching translation for surah ${surahNumber}:`, error);
      return [];
    }
  }

  async searchQuran(keyword: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/search/${keyword}/all/en.sahih`);
      const data = await response.json();
      return data.data.matches || [];
    } catch (error) {
      console.error('Error searching Quran:', error);
      return [];
    }
  }

  getQuranComLink(reference: string, type?: string): string {
    if (type === 'bible') {
      return `https://www.biblegateway.com/quicksearch/?quicksearch=${encodeURIComponent(reference)}&version=NIV`;
    }
    
    // Expected format: "Surah Name 2:255" or "2:255"
    const match = reference.match(/(\d+):(\d+)/);
    if (match) {
      const surah = match[1];
      const ayah = match[2];
      return `https://quran.com/${surah}/${ayah}`;
    }
    return `https://quran.com/search?q=${encodeURIComponent(reference)}`;
  }
}

export const quranService = new QuranService();
