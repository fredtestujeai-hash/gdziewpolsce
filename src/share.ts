/**
 * Adresy udostępniania wyniku w serwisach społecznościowych.
 * To zwykłe linki otwierane w nowej karcie: bez SDK, pikseli i skryptów firm trzecich,
 * więc serwis dowiaduje się o grze dopiero wtedy, gdy gracz sam kliknie przycisk.
 */

export type SharePlatform = "x" | "facebook" | "whatsapp" | "instagram" | "copy" | "system";

/** Post na X (Twitterze): gotowy tekst i osobno link (X sam dokleja go na końcu). */
export function xShareUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

/**
 * Facebook przyjmuje tylko adres strony (zasady platformy nie pozwalają podsunąć gotowego tekstu),
 * dlatego gra kopiuje tekst wyniku do schowka, a post pokazuje podgląd linku z metadanych og:*.
 */
export function facebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/** WhatsApp: cały tekst razem z linkiem (link w tekście WhatsApp zamienia na podgląd). */
export function whatsappShareUrl(text: string, url: string): string {
  const full = text.includes(url) ? text : `${text}\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(full)}`;
}

/** Nazwa pliku obrazka z wynikiem, np. „gdziewpolsce-5-relacja.png”. */
export function shareImageName(number: number, format: "story" | "square"): string {
  return `gdziewpolsce-${number}-${format === "story" ? "relacja" : "kwadrat"}.png`;
}
