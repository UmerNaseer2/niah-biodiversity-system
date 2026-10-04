import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

// iOS draws SF Symbols. Android and web use the Material Symbols font that comes with
// expo-symbols, so the same names work in Expo Go without any extra packages.
function symbol(ios: SFSymbol, material: AndroidSymbol) {
  return { ios, android: material, web: material };
}

export const Icons = {
  home: symbol('house', 'home'),
  scan: symbol('qrcode.viewfinder', 'qr_code_scanner'),
  newRecord: symbol('plus.circle', 'add_circle'),
  records: symbol('list.bullet.rectangle', 'list_alt'),
  profile: symbol('person.crop.circle', 'account_circle'),
  pending: symbol('icloud.and.arrow.up', 'cloud_upload'),
  synced: symbol('checkmark.icloud', 'cloud_done'),
  leaf: symbol('leaf', 'eco'),
  chevron: symbol('chevron.right', 'chevron_right'),
  qr: symbol('qrcode', 'qr_code_2'),
  keyboard: symbol('keyboard', 'keyboard'),
  search: symbol('magnifyingglass', 'search'),
  ruler: symbol('ruler', 'straighten'),
  pin: symbol('mappin.and.ellipse', 'location_on'),
  location: symbol('location.fill', 'my_location'),
  camera: symbol('camera', 'photo_camera'),
  addPhoto: symbol('photo.badge.plus', 'add_a_photo'),
  warning: symbol('exclamationmark.triangle', 'warning'),
  sync: symbol('arrow.triangle.2.circlepath', 'sync'),
  login: symbol('person.badge.key', 'login'),
  phone: symbol('iphone', 'smartphone'),
  info: symbol('info.circle', 'info'),
  notes: symbol('note.text', 'edit_note'),
};

export type IconName = keyof typeof Icons;
