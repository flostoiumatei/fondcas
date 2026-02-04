import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ROMANIAN_MONTHS } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency in Romanian Lei
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format date in Romanian format
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format date short (e.g., "5 ian 2024")
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Get Romanian month name
 */
export function getMonthName(month: number): string {
  return ROMANIAN_MONTHS[month - 1] || '';
}

/**
 * Format relative time (e.g., "acum 2 ore")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'chiar acum';
  if (diffMins < 60) return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
  if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
  if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;

  return formatDateShort(d);
}

/**
 * Calculate distance between two coordinates in km
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format distance for display
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Get days remaining in current month
 */
export function getDaysRemainingInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.getDate() - now.getDate();
}

/**
 * Get current day of month
 */
export function getDayOfMonth(): number {
  return new Date().getDate();
}

/**
 * Get days in current month
 */
export function getDaysInMonth(year?: number, month?: number): number {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  return new Date(y, m, 0).getDate();
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Normalize Romanian text for search (remove diacritics)
 */
export function normalizeRomanian(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ă/g, 'a')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/ș/g, 's')
    .replace(/ț/g, 't');
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Hash string for IP anonymization
 */
export async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate CUI (Romanian company ID)
 */
export function isValidCui(cui: string): boolean {
  const cuiClean = cui.replace(/\D/g, '');
  if (cuiClean.length < 2 || cuiClean.length > 10) return false;

  // CUI validation algorithm
  const controlKey = '753217532';
  let sum = 0;
  const cuiReversed = cuiClean.split('').reverse();

  for (let i = 1; i < cuiReversed.length; i++) {
    sum += parseInt(cuiReversed[i]) * parseInt(controlKey[i - 1]);
  }

  let control = (sum * 10) % 11;
  if (control === 10) control = 0;

  return control === parseInt(cuiReversed[0]);
}

/**
 * Format phone number for display
 */
export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10 && clean.startsWith('0')) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return phone;
}

/**
 * Create Google Maps directions URL
 * Uses address text as destination for better search results
 */
export function getDirectionsUrl(lat: number, lng: number, name?: string, address?: string): string {
  // Prefer using address text as destination - Google Maps will search for it
  // This gives better results than coordinates alone, especially when coordinates
  // point to a general area rather than the exact building

  let destination: string;

  if (address && address.length > 10) {
    // Use full address if available and meaningful
    destination = encodeURIComponent(address);
  } else if (name) {
    // Fall back to name + address
    destination = encodeURIComponent(address ? `${name}, ${address}` : name);
  } else {
    // Last resort: use coordinates
    destination = `${lat},${lng}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

/**
 * Create tel: link
 */
export function getTelLink(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0') && clean.length === 10) {
    return `tel:+40${clean.slice(1)}`;
  }
  return `tel:${clean}`;
}

/**
 * Create Google Maps search URL (for locations without coordinates)
 * Uses name and address to search on Google Maps
 */
export function getGoogleMapsSearchUrl(name: string, address?: string, city?: string): string {
  const parts = [name];
  if (address) parts.push(address);
  if (city) parts.push(city);
  const query = encodeURIComponent(parts.join(', '));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
