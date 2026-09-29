"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  X,
  Clock,
  Smile,
  Users,
  Dog,
  Utensils,
  Trophy,
  Car,
  Lightbulb,
  Heart,
  Flag,
  Sparkles,
  ChevronDown,
} from "lucide-react";

// Kategori Tanımları
export type EmojiCategory =
  | "recent"
  | "smileys"
  | "people"
  | "animals"
  | "food"
  | "activities"
  | "travel"
  | "objects"
  | "symbols"
  | "flags";

interface EmojiItem {
  emoji: string;
  name: string;
  category: EmojiCategory;
  tags: string[];
  supportsTone?: boolean;
}

const CATEGORIES: { id: EmojiCategory; label: string; icon: any }[] = [
  { id: "recent", label: "Son Kullanılanlar", icon: Clock },
  { id: "smileys", label: "Yüzler ve Duygular", icon: Smile },
  { id: "people", label: "İnsanlar ve Jestler", icon: Users },
  { id: "animals", label: "Hayvanlar ve Doğa", icon: Dog },
  { id: "food", label: "Yiyecek ve İçecek", icon: Utensils },
  { id: "activities", label: "Aktivite ve Spor", icon: Trophy },
  { id: "travel", label: "Seyahat ve Taşıt", icon: Car },
  { id: "objects", label: "Nesneler", icon: Lightbulb },
  { id: "symbols", label: "Semboller ve Kalpler", icon: Heart },
  { id: "flags", label: "Bayraklar", icon: Flag },
];

// Ten rengi seçenekleri (Unicode Skin Tone Modifiers)
const SKIN_TONES = [
  { id: "default", label: "Varsayılan", code: "", sample: "👋" },
  { id: "light", label: "Açık", code: "🏻", sample: "👋🏻" },
  { id: "medium-light", label: "Açık Orta", code: "🏼", sample: "👋🏼" },
  { id: "medium", label: "Orta", code: "🏽", sample: "👋🏽" },
  { id: "medium-dark", label: "Koyu Orta", code: "🏾", sample: "👋🏾" },
  { id: "dark", label: "Koyu", code: "🏿", sample: "👋🏿" },
];

// Kaomoji / Japonca Metin İfadeleri
const KAOMOJIS: { category: string; list: string[] }[] = [
  {
    category: "Mutlu & Neşeli",
    list: [
      "(⁠^⁠^⁠)",
      "(⁠◕⁠‿⁠◕⁠)",
      "(⁠人⁠ ⁠•͈⁠ᴗ⁠•͈⁠)",
      "ʕ⁠·⁠ᴥ⁠·⁠ʔ",
      "(⁠｡⁠♡⁠‿⁠♡⁠｡⁠)",
      "(⁠✿⁠^⁠‿⁠^⁠)",
      "(⁠◠⁠‿⁠◕⁠)",
      "＼⁠(⁠^⁠o⁠^⁠)⁠／",
      "(⁠*⁠´⁠ω⁠｀⁠*⁠)",
      "(⁠ ⁠◜⁠‿⁠◝⁠ ⁠)⁠♡",
    ],
  },
  {
    category: "Havalı & Şaşkın",
    list: [
      "¯\\_(ツ)_/¯",
      "(⁠⌐⁠■⁠-⁠■⁠)",
      "(⁠ಠ⁠_⁠ಠ⁠)",
      "(⁠⊙⁠_⁠☉⁠)",
      "(⁠・⁠o⁠・⁠)",
      "(⁠o⁠_⁠O⁠)",
      "(⁠*⁠_⁠*⁠)",
      "(⁠;⁠;⁠;⁠・⁠_⁠・⁠)",
      "(⁠눈⁠_⁠눈⁠)",
      "(⁠・⁠–⁠・⁠;⁠)⁠ゞ",
    ],
  },
  {
    category: "Kızgın & Şakacı",
    list: [
      "(⁠╯⁠°⁠□⁠°⁠）⁠╯⁠︵⁠ ⁠┻⁠━⁠┻",
      "(⁠ノ⁠ಥ⁠益⁠ಥ⁠)⁠ノ",
      "ಠ⁠益⁠ಠ",
      "(⁠`⁠Д⁠´⁠)⁠ノ",
      "(⁠눈⁠‸⁠눈⁠)",
      "(⁠;⁠ŏ⁠﹏⁠ŏ⁠)",
      "凸(｀0´)凸",
      "(⁠/⁠¯⁠◡⁠ ⁠‿⁠ ⁠ゝ⁠)⁠/⁠¯",
    ],
  },
  {
    category: "Sevgi & Sarılma",
    list: [
      "(⁠っ⁠˘̩⁠╭⁠╮⁠˘̩⁠)⁠っ",
      "(⁠´⁠;⁠︵⁠;⁠`⁠)",
      "(⁠つ⁠≧⁠▽⁠≦⁠)⁠つ",
      "(⁠っ⁠.⁠❛⁠ ⁠ᴗ⁠ ⁠❛⁠.⁠)⁠っ",
      "♡⁠(⁠>⁠ ⁠ਊ⁠ ⁠<⁠)⁠♡",
      "(⁠ ⁠T⁠_⁠T⁠)⁠＼⁠(⁠^⁠-⁠^⁠ ⁠)",
      "⊂⁠(⁠･⁠ω⁠･⁠*⁠⊂⁠)",
    ],
  },
];

// Zengin Unicode Emoji Veritabanı
const EMOJI_DATABASE: EmojiItem[] = [
  // --- GÜLÜMSEME VE DUYGULAR (SMILEYS) ---
  { emoji: "😀", name: "Sırıtan Yüz", category: "smileys", tags: ["mutlu", "gülümse", "happy", "smile", "grin"] },
  { emoji: "😃", name: "Büyük Gözlerle Gülen Yüz", category: "smileys", tags: ["mutlu", "neşeli", "joy", "cheerful"] },
  { emoji: "😄", name: "Gözleri Gülen Yüz", category: "smileys", tags: ["kahkaha", "sevinç", "laugh", "happy"] },
  { emoji: "😁", name: "Işıldayan Yüz", category: "smileys", tags: ["diş", "beaming", "mutlu"] },
  { emoji: "😆", name: "Gözleri Kapalı Gülen Yüz", category: "smileys", tags: ["kahkaha", "komik", "xd", "lol"] },
  { emoji: "😅", name: "Terleyen Gülen Yüz", category: "smileys", tags: ["rahatlama", "ter", "sweat", "nervous"] },
  { emoji: "😂", name: "Gözyaşlarıyla Gülen Yüz", category: "smileys", tags: ["kahkaha", "gülme", "joy", "laugh", "lol", "crying"] },
  { emoji: "🤣", name: "Yerde Yuvarlanan Kahkaha", category: "smileys", tags: ["rofl", "komik", "gülmekten kırılma"] },
  { emoji: "🥲", name: "Gözyaşlı Gülümseme", category: "smileys", tags: ["duygusal", "hüzünlü mutluluk", "proud"] },
  { emoji: "🥹", name: "Gözleri Dolan Yüz", category: "smileys", tags: ["tatlı", "yalvaran", "duygulu", "pleading"] },
  { emoji: "😊", name: "Kızaran Gülen Yüz", category: "smileys", tags: ["utangaç", "sevimli", "blush", "cute"] },
  { emoji: "😇", name: "Hale Yüz (Melek)", category: "smileys", tags: ["melek", "masum", "angel", "innocent"] },
  { emoji: "🙂", name: "Hafif Gülümseme", category: "smileys", tags: ["hoşnut", "sakin", "slight smile"] },
  { emoji: "🙃", name: "Ters Yüz", category: "smileys", tags: ["alaycı", "ironi", "sarcasm", "upside down"] },
  { emoji: "😉", name: "Göz Kırpan Yüz", category: "smileys", tags: ["göz kırp", "şaka", "wink", "flirt"] },
  { emoji: "😌", name: "Huzurlu Yüz", category: "smileys", tags: ["rahat", "huzur", "peaceful", "relieved"] },
  { emoji: "😍", name: "Kalp Gözlü Yüz", category: "smileys", tags: ["aşk", "sevgi", "kalp", "love", "heart eyes"] },
  { emoji: "🥰", name: "Kalplerle Çevrili Yüz", category: "smileys", tags: ["sevgi", "hayran", "aşık", "in love"] },
  { emoji: "😘", name: "Öpücük Atan Yüz", category: "smileys", tags: ["öpücük", "öpüyorum", "kiss", "muah"] },
  { emoji: "😗", name: "Öpen Yüz", category: "smileys", tags: ["öpücük", "dudak", "kissing"] },
  { emoji: "😙", name: "Gözleri Gülen Öpücük", category: "smileys", tags: ["sevimli öpücük"] },
  { emoji: "😚", name: "Kapalı Gözle Öpücük", category: "smileys", tags: ["romantik", "masum öpücük"] },
  { emoji: "😋", name: "Lezzetli Yüz", category: "smileys", tags: ["leziz", "yemek", "yum", "delicious", "tasty"] },
  { emoji: "😛", name: "Dil Çıkaran Yüz", category: "smileys", tags: ["dil", "şaka", "tongue"] },
  { emoji: "😜", name: "Göz Kırpıp Dil Çıkaran", category: "smileys", tags: ["çılgın", "şaka", "crazy", "party"] },
  { emoji: "🤪", name: "Çılgın Yüz", category: "smileys", tags: ["deli", "eğlence", "zany", "wild"] },
  { emoji: "😝", name: "Gözleri Kapalı Dil Çıkaran", category: "smileys", tags: ["muzip", "komik"] },
  { emoji: "🤑", name: "Para Gözlü Yüz", category: "smileys", tags: ["para", "zengin", "money", "rich", "dolar"] },
  { emoji: "🤗", name: "Kucaklayan Yüz", category: "smileys", tags: ["sarılma", "kucak", "hug", "warm"] },
  { emoji: "🫣", name: "Gözünü Kapatıp Bakan", category: "smileys", tags: ["merak", "utangaç", "peeking"] },
  { emoji: "🤭", name: "Ağzını Kapatan Yüz", category: "smileys", tags: ["kıkırdama", "ups", "giggle", "oops"] },
  { emoji: "🫢", name: "Şaşkın Ağız Kapatan", category: "smileys", tags: ["şaşırma", "hayret", "gasp"] },
  { emoji: "🫡", name: "Asker Selamı Veren Yüz", category: "smileys", tags: ["selam", "emir", "salute", "respect"] },
  { emoji: "🤫", name: "Sessiz Ol Yüzü", category: "smileys", tags: ["sus", "sessiz", "sır", "shh", "quiet"] },
  { emoji: "🫠", name: "Eriyen Yüz", category: "smileys", tags: ["erime", "sıcak", "utanç", "melting"] },
  { emoji: "🤔", name: "Düşünen Yüz", category: "smileys", tags: ["düşünce", "merak", "soru", "thinking", "hmm"] },
  { emoji: "🤐", name: "Fermuar Ağızlı", category: "smileys", tags: ["ağzımı açmam", "sır", "zipper"] },
  { emoji: "🤨", name: "Kaşını Kaldıran Yüz", category: "smileys", tags: ["şüphe", "emin misin", "skeptical"] },
  { emoji: "😐", name: "Tepkisiz Yüz", category: "smileys", tags: ["nötr", "yorumsuz", "neutral"] },
  { emoji: "😑", name: "İfadesiz Yüz", category: "smileys", tags: ["bıkkın", "bezgin", "expressionless"] },
  { emoji: "😶", name: "Ağızsız Yüz", category: "smileys", tags: ["söyleyecek söz yok", "sessiz"] },
  { emoji: "🫥", name: "Noktalı Çizgi Yüz", category: "smileys", tags: ["görünmez", "yok gibi", "invisible"] },
  { emoji: "😶‍🌫️", name: "Dumanlar Arasında Yüz", category: "smileys", tags: ["sis", "kafa karışık", "cloud"] },
  { emoji: "😏", name: "Bıyık Altından Gülen", category: "smileys", tags: ["sinsi", "imalı", "smirk"] },
  { emoji: "😒", name: "Keyifsiz Yüz", category: "smileys", tags: ["sıkılmış", "hoşnutsuz", "unamused"] },
  { emoji: "🙄", name: "Gözlerini Deviren Yüz", category: "smileys", tags: ["off", "bıktım", "eye roll"] },
  { emoji: "😬", name: "Diş Sıkan Yüz", category: "smileys", tags: ["gergin", "korkunç durum", "grimacing"] },
  { emoji: "🤥", name: "Yalancı Yüz", category: "smileys", tags: ["yalan", "pinokyo", "lying"] },
  { emoji: "😌", name: "Huzurlu", category: "smileys", tags: ["relax", "huzur"] },
  { emoji: "😔", name: "Düşünceli Üzgün", category: "smileys", tags: ["üzgün", "keder", "sad"] },
  { emoji: "😪", name: "Uykulu Yüz", category: "smileys", tags: ["uyku", "yorgun", "sleepy"] },
  { emoji: "🤤", name: "Ağzı Sulanan", category: "smileys", tags: ["iştah", "drool"] },
  { emoji: "😴", name: "Uyuyan Yüz", category: "smileys", tags: ["uyku", "horlama", "zzz", "sleeping"] },
  { emoji: "😷", name: "Maskeli Yüz", category: "smileys", tags: ["hasta", "maske", "korona", "sick"] },
  { emoji: "🤒", name: "Termometreli Yüz", category: "smileys", tags: ["ateş", "hasta", "fever"] },
  { emoji: "🤕", name: "Sargılı Yüz", category: "smileys", tags: ["yaralı", "kaza", "hurt"] },
  { emoji: "🤢", name: "Midesi Bulanan", category: "smileys", tags: ["iğrenç", "kusmak", "nauseated"] },
  { emoji: "🤮", name: "Kusan Yüz", category: "smileys", tags: ["kusma", "öğürme", "vomit"] },
  { emoji: "🤧", name: "Hapşıran Yüz", category: "smileys", tags: ["nezle", "grip", "sneeze"] },
  { emoji: "🥵", name: "Aşırı Sıcak Yüz", category: "smileys", tags: ["sıcak", "terli", "hot", "flame"] },
  { emoji: "🥶", name: "Donan Yüz", category: "smileys", tags: ["soğuk", "buz", "cold", "freeze"] },
  { emoji: "🥴", name: "Sarhoş / Başı Dönen", category: "smileys", tags: ["sarhoş", "sersem", "woozy"] },
  { emoji: "😵", name: "Gözü Dönmüş Yüz", category: "smileys", tags: ["şok", "baygın", "dizzy"] },
  { emoji: "😵‍💫", name: "Spiralli Gözlü Yüz", category: "smileys", tags: ["hipnoz", "sersem"] },
  { emoji: "🤯", name: "Kafası Patlayan Yüz", category: "smileys", tags: ["şok", "inanamıyorum", "mind blown"] },
  { emoji: "🤠", name: "Kovboy Şapkalı", category: "smileys", tags: ["kovboy", "cowboy"] },
  { emoji: "🥳", name: "Kutlama Yapan Yüz", category: "smileys", tags: ["parti", "doğum günü", "tebrik", "party"] },
  { emoji: "🥸", name: "Kılık Değiştirmiş Yüz", category: "smileys", tags: ["gözlük", "bıyık", "disguise"] },
  { emoji: "😎", name: "Güneş Gözlüklü Yüz", category: "smileys", tags: ["havalı", "cool", "sunglasses"] },
  { emoji: "🤓", name: "Gözlüklü Zeki (Nerd)", category: "smileys", tags: ["bilgisayar", "ders", "geek", "nerd"] },
  { emoji: "🧐", name: "Monokllü Yüz", category: "smileys", tags: ["inceleyen", "dedektif", "monocle"] },
  { emoji: "😕", name: "Kafası Karışık", category: "smileys", tags: ["karışık", "confused"] },
  { emoji: "😟", name: "Endişeli Yüz", category: "smileys", tags: ["korku", "endişe", "worried"] },
  { emoji: "🙁", name: "Hafif Asık Surat", category: "smileys", tags: ["asık surat", "frown"] },
  { emoji: "☹️", name: "Asık Surat", category: "smileys", tags: ["üzgün", "mutsuz"] },
  { emoji: "😮", name: "Ağzı Açık Yüz", category: "smileys", tags: ["şaşırma", "surprised"] },
  { emoji: "😯", name: "Şaşırmış Yüz", category: "smileys", tags: ["şaşkın"] },
  { emoji: "😲", name: "Hayrete Düşen Yüz", category: "smileys", tags: ["inanamıyorum", "astonished"] },
  { emoji: "😳", name: "Kızaran Şaşkın Yüz", category: "smileys", tags: ["utanma", "şaşırma", "flushed"] },
  { emoji: "🥺", name: "Yalvaran Yüz", category: "smileys", tags: ["lütfen", "kıyamam", "pleading", "cute"] },
  { emoji: "😦", name: "Kaşları Çatık Açık Ağız", category: "smileys", tags: ["korku"] },
  { emoji: "😧", name: "Acı Çeken Yüz", category: "smileys", tags: ["acı", "anguished"] },
  { emoji: "😨", name: "Korkmuş Yüz", category: "smileys", tags: ["korku", "fearful"] },
  { emoji: "😰", name: "Mavi Alınlı Endişeli", category: "smileys", tags: ["panik", "anxious"] },
  { emoji: "😥", name: "Hüzünlü Rahatlama", category: "smileys", tags: ["kurtuldum", "sad"] },
  { emoji: "😢", name: "Ağlayan Yüz", category: "smileys", tags: ["ağla", "üzüntü", "crying", "tear"] },
  { emoji: "😭", name: "Hüngür Hüngür Ağlayan", category: "smileys", tags: ["çok ağlama", "keder", "sob", "loud crying"] },
  { emoji: "😱", name: "Korkudan Çığlık Atan", category: "smileys", tags: ["çığlık", "korkunç", "scream", "horror"] },
  { emoji: "😖", name: "Sıkıntılı Yüz", category: "smileys", tags: ["tahammül edemiyorum"] },
  { emoji: "😣", name: "Azimli Yüz", category: "smileys", tags: ["zorlanma"] },
  { emoji: "😞", name: "Hayal Kırıklığı", category: "smileys", tags: ["üzgün", "disappointed"] },
  { emoji: "😓", name: "Soğuk Ter Döken", category: "smileys", tags: ["yoruldum", "downcast"] },
  { emoji: "😩", name: "Bitkin Yüz", category: "smileys", tags: ["tükenmiş", "weary"] },
  { emoji: "😫", name: "Yorgun Yüz", category: "smileys", tags: ["bıktım", "tired"] },
  { emoji: "🥱", name: "Esneyen Yüz", category: "smileys", tags: ["esneme", "uykulu", "yawn"] },
  { emoji: "😤", name: "Burnundan Soluyan", category: "smileys", tags: ["öfke", "zafer", "triumph", "steam"] },
  { emoji: "😡", name: "Öfkeli Kırmızı Yüz", category: "smileys", tags: ["kızgın", "sinirli", "rage", "pout"] },
  { emoji: "😠", name: "Kızgın Yüz", category: "smileys", tags: ["sinir", "angry"] },
  { emoji: "🤬", name: "Küfreden Yüz", category: "smileys", tags: ["küfür", "sansür", "cursing", "swearing"] },
  { emoji: "😈", name: "Gülümseyen Şeytan", category: "smileys", tags: ["yaramaz", "devil", "evil smile"] },
  { emoji: "👿", name: "Kızgın Şeytan", category: "smileys", tags: ["şeytan", "angry devil"] },
  { emoji: "💀", name: "Kafatası", category: "smileys", tags: ["ölü", "öldüm gülmekten", "skull", "dead"] },
  { emoji: "☠️", name: "Kafatası ve Kemikler", category: "smileys", tags: ["tehlike", "korsan", "crossbones"] },
  { emoji: "💩", name: "Kaka", category: "smileys", tags: ["komik", "poop"] },
  { emoji: "🤡", name: "Palyaço", category: "smileys", tags: ["palyaço", "komik", "clown"] },
  { emoji: "👻", name: "Hayalet", category: "smileys", tags: ["hayalet", "korku", "ghost"] },
  { emoji: "👽", name: "Uzaylı", category: "smileys", tags: ["uzay", "ufo", "alien"] },
  { emoji: "🤖", name: "Robot Yüzü", category: "smileys", tags: ["robot", "yapay zeka", "ai", "bot"] },
  { emoji: "🎃", name: "Cadılar Bayramı Balkabağı", category: "smileys", tags: ["balkabağı", "halloween", "pumpkin"] },

  // --- İNSANLAR VE JESTLER (PEOPLE) ---
  { emoji: "👋", name: "El Sallama", category: "people", tags: ["selam", "merhaba", "bye", "wave", "hello"], supportsTone: true },
  { emoji: "🤚", name: "Elin Arkası", category: "people", tags: ["el", "dur", "backhand"], supportsTone: true },
  { emoji: "🖐️", name: "Açık El", category: "people", tags: ["beş", "el", "fingers"], supportsTone: true },
  { emoji: "✋", name: "Kaldırılmış El", category: "people", tags: ["dur", "yüksek beşlik", "high five"], supportsTone: true },
  { emoji: "🖖", name: "Vulcan Selamı", category: "people", tags: ["spock", "uzay", "vulcan"], supportsTone: true },
  { emoji: "🫱", name: "Sağa Doğru El", category: "people", tags: ["sağ el", "uzatmak"], supportsTone: true },
  { emoji: "🫲", name: "Sola Doğru El", category: "people", tags: ["sol el"], supportsTone: true },
  { emoji: "👌", name: "Tamam İşareti", category: "people", tags: ["ok", "harika", "mükemmel", "perfect"], supportsTone: true },
  { emoji: "🤌", name: "İtalyan El Hareketi", category: "people", tags: ["ne diyorsun", "lezzetli", "pinched"], supportsTone: true },
  { emoji: "🤏", name: "Azıcık İşareti", category: "people", tags: ["az", "küçük", "birazcık", "pinch"], supportsTone: true },
  { emoji: "✌️", name: "Zafer / Barış İşareti", category: "people", tags: ["barış", "zafer", "peace", "victory"], supportsTone: true },
  { emoji: "🤞", name: "Şans Dileme (Parmak Çapraz)", category: "people", tags: ["şans", "inşallah", "luck", "fingers crossed"], supportsTone: true },
  { emoji: "🫰", name: "Kore Kalbi (Parmak Kalp)", category: "people", tags: ["kalp", "kpop", "finger heart", "love"], supportsTone: true },
  { emoji: "🤟", name: "Seni Seviyorum İşareti", category: "people", tags: ["sevgi", "rock", "love you"], supportsTone: true },
  { emoji: "🤘", name: "Rock İşareti", category: "people", tags: ["metal", "rock on", "horns"], supportsTone: true },
  { emoji: "🤙", name: "Beni Ara İşareti", category: "people", tags: ["alo", "rahat ol", "call me", "shaka"], supportsTone: true },
  { emoji: "👈", name: "Solu Gösteren Parmak", category: "people", tags: ["sol", "point left"], supportsTone: true },
  { emoji: "👉", name: "Sağı Gösteren Parmak", category: "people", tags: ["sağ", "point right"], supportsTone: true },
  { emoji: "👆", name: "Yukarıyı Gösteren Parmak", category: "people", tags: ["yukarı", "point up"], supportsTone: true },
  { emoji: "👇", name: "Aşağıyı Gösteren Parmak", category: "people", tags: ["aşağı", "point down"], supportsTone: true },
  { emoji: "☝️", name: "İşaret Parmağı Yukarı", category: "people", tags: ["bir", "dikkat", "point up"], supportsTone: true },
  { emoji: "👍", name: "Başparmak Yukarı (Beğendim)", category: "people", tags: ["beğen", "onay", "harika", "thumbs up", "like", "ok"], supportsTone: true },
  { emoji: "👎", name: "Başparmak Aşağı (Beğenmedim)", category: "people", tags: ["kötü", "red", "thumbs down", "dislike"], supportsTone: true },
  { emoji: "✊", name: "Kalkık Yumruk", category: "people", tags: ["direniş", "güç", "fist"], supportsTone: true },
  { emoji: "👊", name: "Yumruk Çakma", category: "people", tags: ["yumruk", "fist bump"], supportsTone: true },
  { emoji: "👏", name: "Alkış", category: "people", tags: ["tebrik", "alkışla", "bravo", "clap", "applause"], supportsTone: true },
  { emoji: "🙌", name: "İki El Havaya", category: "people", tags: ["kutlama", "yaşasın", "celebration", "hooray"], supportsTone: true },
  { emoji: "🫶", name: "Ellerle Kalp", category: "people", tags: ["kalp", "sevgi", "heart hands", "love"], supportsTone: true },
  { emoji: "👐", name: "Açık Eller", category: "people", tags: ["kucak", "açık", "open hands"], supportsTone: true },
  { emoji: "🤲", name: "Dua Eden Eller (Açık)", category: "people", tags: ["dua", "niyaz", "palms up", "prayer"], supportsTone: true },
  { emoji: "🤝", name: "El Sıkışma", category: "people", tags: ["anlaşma", "selamlaşma", "handshake", "deal"] },
  { emoji: "🙏", name: "Birleşmiş Eller (Dua / Teşekkür)", category: "people", tags: ["teşekkür", "lütfen", "dua", "namaste", "pray", "thanks"], supportsTone: true },
  { emoji: "✍️", name: "Yazı Yazan El", category: "people", tags: ["yazı", "not", "writing"], supportsTone: true },
  { emoji: "💅", name: "Oje Sürme", category: "people", tags: ["bakım", "umursamaz", "nail polish"], supportsTone: true },
  { emoji: "🤳", name: "Selfie Çekme", category: "people", tags: ["özçekim", "fotoğraf", "selfie"], supportsTone: true },
  { emoji: "💪", name: "Pazı (Güç)", category: "people", tags: ["güç", "kas", "spor", "strong", "bicep", "flex"], supportsTone: true },
  { emoji: "👀", name: "Gözler", category: "people", tags: ["bakış", "dikkat", "gördüm", "eyes", "look"] },
  { emoji: "👁️", name: "Tek Göz", category: "people", tags: ["göz", "eye"] },
  { emoji: "👅", name: "Dil", category: "people", tags: ["dil", "tat", "tongue"] },
  { emoji: "👄", name: "Dudak", category: "people", tags: ["öpücük", "ağız", "lips"] },
  { emoji: "🫦", name: "Dudak Isırma", category: "people", tags: ["flört", "heyecan", "biting lip"] },
  { emoji: "🧠", name: "Beyin", category: "people", tags: ["zeka", "fikir", "brain", "mind"] },
  { emoji: "❤️‍🔥", name: "Ateşli Kalp", category: "people", tags: ["tutku", "aşk", "heart on fire"] },
  { emoji: "❤️‍🩹", name: "İyileşen Kalp", category: "people", tags: ["onarım", "mending heart"] },

  // --- HAYVANLAR VE DOĞA (ANIMALS) ---
  { emoji: "🐶", name: "Köpek Yüzü", category: "animals", tags: ["köpek", "havhav", "dog", "puppy"] },
  { emoji: "🐱", name: "Kedi Yüzü", category: "animals", tags: ["kedi", "miyav", "cat", "kitten"] },
  { emoji: "🐭", name: "Fare", category: "animals", tags: ["fare", "mouse"] },
  { emoji: "🐹", name: "Hamster", category: "animals", tags: ["hamster", "sevimli"] },
  { emoji: "🐰", name: "Tavşan", category: "animals", tags: ["tavşan", "bunny", "rabbit"] },
  { emoji: "🦊", name: "Tilki", category: "animals", tags: ["tilki", "kurnaz", "fox"] },
  { emoji: "🐻", name: "Ayı", category: "animals", tags: ["ayı", "bear"] },
  { emoji: "🐼", name: "Panda", category: "animals", tags: ["panda", "bambu"] },
  { emoji: "🐨", name: "Koala", category: "animals", tags: ["koala", "okaliptüs"] },
  { emoji: "🐯", name: "Kaplan", category: "animals", tags: ["kaplan", "tiger"] },
  { emoji: "🦁", name: "Aslan", category: "animals", tags: ["aslan", "kral", "lion"] },
  { emoji: "🐮", name: "İnek", category: "animals", tags: ["inek", "süt", "cow"] },
  { emoji: "🐷", name: "Domuzcuk", category: "animals", tags: ["domuz", "pig"] },
  { emoji: "🐸", name: "Kurbağa", category: "animals", tags: ["kurbağa", "vırak", "frog"] },
  { emoji: "🐵", name: "Maymun", category: "animals", tags: ["maymun", "monkey"] },
  { emoji: "🙈", name: "Görmedim Maymunu", category: "animals", tags: ["utanma", "görmedim", "see no evil"] },
  { emoji: "🙉", name: "Duymadım Maymunu", category: "animals", tags: ["duymadım", "hear no evil"] },
  { emoji: "🙊", name: "Söylemedim Maymunu", category: "animals", tags: ["söylemedim", "speak no evil"] },
  { emoji: "🐦", name: "Kuş", category: "animals", tags: ["kuş", "bird"] },
  { emoji: "🐧", name: "Penguen", category: "animals", tags: ["penguen", "buz", "penguin"] },
  { emoji: "🦅", name: "Kartal", category: "animals", tags: ["kartal", "eagle"] },
  { emoji: "🦉", name: "Baykuş", category: "animals", tags: ["baykuş", "gece", "owl"] },
  { emoji: "🐺", name: "Kurt", category: "animals", tags: ["kurt", "bozkurt", "wolf"] },
  { emoji: "🐴", name: "At", category: "animals", tags: ["at", "horse"] },
  { emoji: "🦄", name: "Tekboynuz (Unicorn)", category: "animals", tags: ["unicorn", "büyü", "magic"] },
  { emoji: "🐝", name: "Bal Arısı", category: "animals", tags: ["arı", "bal", "bee"] },
  { emoji: "🦋", name: "Kelebek", category: "animals", tags: ["kelebek", "renkli", "butterfly"] },
  { emoji: "🐢", name: "Kaplumbağa", category: "animals", tags: ["kaplumbağa", "yavaş", "turtle"] },
  { emoji: "🐍", name: "Yılan", category: "animals", tags: ["yılan", "snake"] },
  { emoji: "🐬", name: "Yunus", category: "animals", tags: ["yunus", "deniz", "dolphin"] },
  { emoji: "🐳", name: "Balina", category: "animals", tags: ["balina", "whale"] },
  { emoji: "🦈", name: "Köpekbalığı", category: "animals", tags: ["köpekbalığı", "shark"] },
  { emoji: "🌸", name: "Kiraz Çiçeği", category: "animals", tags: ["çiçek", "sakura", "cherry blossom"] },
  { emoji: "🌹", name: "Kırmızı Gül", category: "animals", tags: ["gül", "çiçek", "aşk", "rose"] },
  { emoji: "🌺", name: "Ebegümeci", category: "animals", tags: ["çiçek", "hibiscus"] },
  { emoji: "🌻", name: "Ayçiçeği", category: "animals", tags: ["günebakan", "ayçiçeği", "sunflower"] },
  { emoji: "🌲", name: "Çam Ağacı", category: "animals", tags: ["ağaç", "orman", "tree", "pine"] },
  { emoji: "🍀", name: "Dört Yapraklı Yonca", category: "animals", tags: ["şans", "yonca", "clover", "luck"] },
  { emoji: "🔥", name: "Ateş (Alev)", category: "animals", tags: ["ateş", "alev", "sıcak", "harika", "fire", "hot", "lit"] },
  { emoji: "✨", name: "Pırıltılar (Yıldızlar)", category: "animals", tags: ["parlak", "büyü", "sparkles", "shine", "magic"] },
  { emoji: "🌟", name: "Parlayan Yıldız", category: "animals", tags: ["yıldız", "star", "glowing"] },
  { emoji: "⭐️", name: "Yıldız", category: "animals", tags: ["yıldız", "star"] },
  { emoji: "🌙", name: "Hilal (Ay)", category: "animals", tags: ["ay", "gece", "hilal", "crescent moon"] },
  { emoji: "☀️", name: "Güneş", category: "animals", tags: ["güneş", "yaz", "sun", "sunny"] },
  { emoji: "🌈", name: "Gökkuşağı", category: "animals", tags: ["renkler", "gökkuşağı", "rainbow"] },
  { emoji: "⚡", name: "Yıldırım / Şimşek", category: "animals", tags: ["şimşek", "enerji", "lightning", "volt"] },
  { emoji: "❄️", name: "Kar Tanesi", category: "animals", tags: ["kar", "kış", "soğuk", "snow", "cold"] },
  { emoji: "💧", name: "Su Damlası", category: "animals", tags: ["su", "damla", "water", "drop"] },

  // --- YİYECEK VE İÇECEK (FOOD) ---
  { emoji: "🍎", name: "Kırmızı Elma", category: "food", tags: ["elma", "meyve", "apple"] },
  { emoji: "🍌", name: "Muz", category: "food", tags: ["muz", "banana"] },
  { emoji: "🍉", name: "Karpuz", category: "food", tags: ["karpuz", "yaz", "watermelon"] },
  { emoji: "🍇", name: "Üzüm", category: "food", tags: ["üzüm", "grapes"] },
  { emoji: "🍓", name: "Çilek", category: "food", tags: ["çilek", "strawberry"] },
  { emoji: "🍒", name: "Kiraz", category: "food", tags: ["kiraz", "cherry"] },
  { emoji: "🥑", name: "Avokado", category: "food", tags: ["avokado"] },
  { emoji: "🍕", name: "Pizza Dilimi", category: "food", tags: ["pizza", "yemek", "fast food"] },
  { emoji: "🍔", name: "Hamburger", category: "food", tags: ["burger", "hamburger", "fast food"] },
  { emoji: "🍟", name: "Patates Kızartması", category: "food", tags: ["patates", "fries"] },
  { emoji: "🌭", name: "Sosisli Sandviç", category: "food", tags: ["hotdog", "sosisli"] },
  { emoji: "🥪", name: "Sandviç", category: "food", tags: ["sandviç", "ekmek"] },
  { emoji: "🌮", name: "Tako", category: "food", tags: ["taco", "meksika"] },
  { emoji: "🍣", name: "Suşi", category: "food", tags: ["sushi", "japon"] },
  { emoji: "🍦", name: "Dondurma", category: "food", tags: ["dondurma", "ice cream"] },
  { emoji: "🍰", name: "Pasta", category: "food", tags: ["tatlı", "pasta", "cake"] },
  { emoji: "🎂", name: "Doğum Günü Pastası", category: "food", tags: ["doğum günü", "kutlama", "birthday cake"] },
  { emoji: "🍫", name: "Çikolata", category: "food", tags: ["çikolata", "tatlı", "chocolate"] },
  { emoji: "🍿", name: "Patlamış Mısır", category: "food", tags: ["mısır", "sinema", "popcorn"] },
  { emoji: "☕", name: "Sıcak Kahve / Çay", category: "food", tags: ["kahve", "çay", "sabah", "coffee", "tea"] },
  { emoji: "🧋", name: "Baloncuklu Çay (Boba)", category: "food", tags: ["boba", "bubble tea"] },
  { emoji: "🍺", name: "Bira Bardağı", category: "food", tags: ["bira", "kutlama", "beer"] },
  { emoji: "🍻", name: "Bira Kadeh Kaldırma", category: "food", tags: ["şerefe", "kutlama", "cheers"] },
  { emoji: "🍷", name: "Kırmızı Şarap", category: "food", tags: ["şarap", "kadeh", "wine"] },

  // --- AKTİVİTE VE SPOR (ACTIVITIES) ---
  { emoji: "⚽", name: "Futbol Topu", category: "activities", tags: ["futbol", "maç", "top", "soccer", "football"] },
  { emoji: "🏀", name: "Basketbol Topu", category: "activities", tags: ["basket", "top", "basketball"] },
  { emoji: "🎾", name: "Tenis Topu", category: "activities", tags: ["tenis", "tennis"] },
  { emoji: "🏐", name: "Voleybol Topu", category: "activities", tags: ["voleybol", "volleyball"] },
  { emoji: "🎱", name: "8 Numaralı Bilardo", category: "activities", tags: ["bilardo", "pool", "billiards"] },
  { emoji: "🏓", name: "Masa Tenisi (Ping Pong)", category: "activities", tags: ["pingpong", "masa tenisi"] },
  { emoji: "🥊", name: "Boks Eldiveni", category: "activities", tags: ["boks", "dövüş", "boxing"] },
  { emoji: "🏆", name: "Şampiyonluk Kupası", category: "activities", tags: ["kupa", "birinci", "zafer", "trophy", "winner"] },
  { emoji: "🥇", name: "Altın Madalya", category: "activities", tags: ["madalya", "altın", "gold medal"] },
  { emoji: "🎯", name: "Hedef Tahtası (Dart)", category: "activities", tags: ["hedef", "isabet", "dart", "target"] },
  { emoji: "🎮", name: "Oyun Konsolu Kolu", category: "activities", tags: ["oyun", "gamer", "playstation", "game", "controller"] },
  { emoji: "🎲", name: "Zar", category: "activities", tags: ["zar", "şans", "dice"] },
  { emoji: "🎨", name: "Ressam Paleti", category: "activities", tags: ["sanat", "resim", "art", "paint"] },
  { emoji: "🎬", name: "Klaket (Sinema)", category: "activities", tags: ["film", "sinema", "movie", "action"] },
  { emoji: "🎤", name: "Mikrofon", category: "activities", tags: ["şarkı", "karaoke", "mic", "sing"] },
  { emoji: "🎧", name: "Kulaklık", category: "activities", tags: ["müzik", "ses", "headphones", "music"] },
  { emoji: "🎸", name: "Gitar", category: "activities", tags: ["müzik", "gitar", "guitar"] },

  // --- SEYAHAT VE TAŞIT (TRAVEL) ---
  { emoji: "🚗", name: "Araba", category: "travel", tags: ["araba", "otomobil", "car"] },
  { emoji: "🏎️", name: "Yarış Arabası", category: "travel", tags: ["hız", "f1", "race car"] },
  { emoji: "🏍️", name: "Motosiklet", category: "travel", tags: ["motor", "hız", "motorcycle"] },
  { emoji: "🚲", name: "Bisiklet", category: "travel", tags: ["bisiklet", "bicycle", "bike"] },
  { emoji: "✈️", name: "Uçak", category: "travel", tags: ["uçak", "tatil", "seyahat", "airplane", "flight"] },
  { emoji: "🚀", name: "Roket", category: "travel", tags: ["roket", "uzay", "uçuş", "rocket", "to the moon"] },
  { emoji: "🚢", name: "Gemi", category: "travel", tags: ["gemi", "deniz", "ship"] },
  { emoji: "🏖️", name: "Kumsal ve Şemsiye", category: "travel", tags: ["tatil", "plaj", "deniz", "beach"] },
  { emoji: "🏕️", name: "Kamp Çadırı", category: "travel", tags: ["kamp", "doğa", "camping"] },
  { emoji: "🏠", name: "Ev", category: "travel", tags: ["ev", "yuva", "home", "house"] },

  // --- NESNELER (OBJECTS) ---
  { emoji: "📱", name: "Cep Telefonu", category: "objects", tags: ["telefon", "mobil", "phone", "iphone"] },
  { emoji: "💻", name: "Dizüstü Bilgisayar", category: "objects", tags: ["laptop", "bilgisayar", "pc", "macbook"] },
  { emoji: "💡", name: "Ampul (Fikir)", category: "objects", tags: ["fikir", "ışık", "buluş", "idea", "lightbulb"] },
  { emoji: "💰", name: "Para Torbası", category: "objects", tags: ["para", "zenginlik", "money", "bag"] },
  { emoji: "💵", name: "Dolar Banknotu", category: "objects", tags: ["para", "dolar", "cash"] },
  { emoji: "💎", name: "Elmas (Pırlanta)", category: "objects", tags: ["mücevher", "değerli", "diamond", "gem"] },
  { emoji: "🎁", name: "Hediye Paketi", category: "objects", tags: ["hediye", "sürpriz", "gift", "present"] },
  { emoji: "🎉", name: "Parti Konfetisi", category: "objects", tags: ["tebrik", "kutlama", "yaşasın", "party popper"] },
  { emoji: "🎈", name: "Kırmızı Balon", category: "objects", tags: ["balon", "parti", "balloon"] },
  { emoji: "🔑", name: "Anahtar", category: "objects", tags: ["anahtar", "şifre", "key"] },
  { emoji: "🔒", name: "Kilitli Asma Kilit", category: "objects", tags: ["güvenli", "kilit", "lock"] },
  { emoji: "💣", name: "Bomba", category: "objects", tags: ["bomba", "patlama", "bomb"] },
  { emoji: "🧿", name: "Nazar Boncuğu", category: "objects", tags: ["nazar", "kem göz", "evil eye", "amulet", "türk"] },

  // --- SEMBOLLER VE KALPLER (SYMBOLS) ---
  { emoji: "❤️", name: "Kırmızı Kalp", category: "symbols", tags: ["aşk", "sevgi", "kalp", "heart", "love"] },
  { emoji: "🧡", name: "Turuncu Kalp", category: "symbols", tags: ["kalp", "orange heart"] },
  { emoji: "💛", name: "Sarı Kalp", category: "symbols", tags: ["dostluk", "kalp", "yellow heart"] },
  { emoji: "💚", name: "Yeşil Kalp", category: "symbols", tags: ["doğa", "kalp", "green heart"] },
  { emoji: "💙", name: "Mavi Kalp", category: "symbols", tags: ["güven", "kalp", "blue heart"] },
  { emoji: "💜", name: "Mor Kalp", category: "symbols", tags: ["mor", "kalp", "purple heart"] },
  { emoji: "🖤", name: "Siyah Kalp", category: "symbols", tags: ["siyah", "kalp", "black heart"] },
  { emoji: "🤍", name: "Beyaz Kalp", category: "symbols", tags: ["masum", "kalp", "white heart"] },
  { emoji: "🤎", name: "Kahverengi Kalp", category: "symbols", tags: ["kalp", "brown heart"] },
  { emoji: "💔", name: "Kırık Kalp", category: "symbols", tags: ["ayrılık", "üzüntü", "broken heart"] },
  { emoji: "❣️", name: "Kalpli Ünlem", category: "symbols", tags: ["ünlem", "kalp", "exclamation"] },
  { emoji: "💕", name: "İki Kalp", category: "symbols", tags: ["sevgi", "two hearts"] },
  { emoji: "💞", name: "Dönen Kalpler", category: "symbols", tags: ["dönen kalp", "revolving hearts"] },
  { emoji: "💓", name: "Çarpan Kalp", category: "symbols", tags: ["nabız", "beating heart"] },
  { emoji: "💗", name: "Büyüyen Kalp", category: "symbols", tags: ["büyüyen kalp", "growing heart"] },
  { emoji: "💖", name: "Işıldayan Kalp", category: "symbols", tags: ["pırıltı", "sparkling heart"] },
  { emoji: "💘", name: "Oklu Kalp (Kupidon)", category: "symbols", tags: ["aşk oku", "cupid", "arrow"] },
  { emoji: "💯", name: "Yüz Puan", category: "symbols", tags: ["tam puan", "yüz", "100", "perfect", "score"] },
  { emoji: "✅", name: "Yeşil Onay İşareti", category: "symbols", tags: ["onay", "doğru", "check", "tamam"] },
  { emoji: "❌", name: "Kırmızı Çarpı", category: "symbols", tags: ["hata", "çarpı", "iptal", "cross", "no"] },
  { emoji: "⚠️", name: "Uyarı İşareti", category: "symbols", tags: ["dikkat", "tehlike", "warning"] },
  { emoji: "⛔", name: "Girilmez", category: "symbols", tags: ["dur", "yasak", "stop"] },
  { emoji: "⚡", name: "Yüksek Gerilim", category: "symbols", tags: ["elektrik", "yıldırım"] },

  // --- BAYRAKLAR (FLAGS) ---
  { emoji: "🇹🇷", name: "Türkiye Bayrağı", category: "flags", tags: ["türkiye", "turkey", "bayrak", "ay yıldız", "flag"] },
  { emoji: "🇦🇿", name: "Azerbaycan Bayrağı", category: "flags", tags: ["azerbaycan", "azerbaijan", "kardeş"] },
  { emoji: "🇰🇿", name: "Kazakistan Bayrağı", category: "flags", tags: ["kazakistan", "kazakhstan"] },
  { emoji: "🇺🇿", name: "Özbekistan Bayrağı", category: "flags", tags: ["özbekistan", "uzbekistan"] },
  { emoji: "🇹🇲", name: "Türkmenistan Bayrağı", category: "flags", tags: ["türkmenistan"] },
  { emoji: "🇰🇬", name: "Kırgızistan Bayrağı", category: "flags", tags: ["kırgızistan"] },
  { emoji: "🇩🇪", name: "Almanya Bayrağı", category: "flags", tags: ["almanya", "germany"] },
  { emoji: "🇬🇧", name: "Birleşik Krallık (İngiltere)", category: "flags", tags: ["ingiltere", "uk", "britain"] },
  { emoji: "🇺🇸", name: "Amerika Birleşik Devletleri", category: "flags", tags: ["amerika", "usa", "abd"] },
  { emoji: "🇫🇷", name: "Fransa Bayrağı", category: "flags", tags: ["fransa", "france"] },
  { emoji: "🇮🇹", name: "İtalya Bayrağı", category: "flags", tags: ["italya", "italy"] },
  { emoji: "🇪🇸", name: "İspanya Bayrağı", category: "flags", tags: ["ispanya", "spain"] },
  { emoji: "🇯🇵", name: "Japonya Bayrağı", category: "flags", tags: ["japonya", "japan"] },
  { emoji: "🇧🇷", name: "Brezilya Bayrağı", category: "flags", tags: ["brezilya", "brazil"] },
  { emoji: "🇵🇸", name: "Filistin Bayrağı", category: "flags", tags: ["filistin", "palestine"] },
  { emoji: "🏁", name: "Damalı Bayrak (Bitiş)", category: "flags", tags: ["damalı", "yarış", "finish"] },
  { emoji: "🚩", name: "Kırmızı Üçgen Bayrak", category: "flags", tags: ["red flag", "bayrak"] },
  { emoji: "🏴‍☠️", name: "Korsan Bayrağı", category: "flags", tags: ["korsan", "pirate flag"] },
];

const RECENT_EMOJIS_KEY = "aura_recent_emojis";

interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  className?: string;
  anchorPosition?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
}

export default function EmojiPicker({
  isOpen,
  onClose,
  onSelectEmoji,
  className = "",
  anchorPosition = "bottom-left",
}: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<"emoji" | "kaomoji">("emoji");
  const [activeCategory, setActiveCategory] = useState<EmojiCategory>("smileys");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSkinTone, setSelectedSkinTone] = useState<string>("");
  const [isTonePickerOpen, setIsTonePickerOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [hoveredEmoji, setHoveredEmoji] = useState<{ emoji: string; name: string } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // localStorage'dan son kullanılan emojileri yükle
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      if (stored) {
        setRecentEmojis(JSON.parse(stored));
      } else {
        // Varsayılan popüler emojiler
        setRecentEmojis(["😂", "❤️", "🔥", "👍", "😍", "🙏", "✨", "🥰", "🇹🇷", "👏", "🤣", "🎉"]);
      }
    } catch {
      setRecentEmojis(["😂", "❤️", "🔥", "👍", "😍", "🙏"]);
    }
  }, []);

  // Açıldığında arama kutusuna odaklan (PC'de harika bir deneyim)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
    } else {
      setSearchQuery("");
      setIsTonePickerOpen(false);
      setHoveredEmoji(null);
    }
  }, [isOpen]);

  // Dışarı tıklayınca veya ESC tuşuna basılınca kapat
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Emojiyi seç ve son kullanılanlara ekle
  const handleEmojiClick = (rawEmoji: string, name?: string) => {
    let finalEmoji = rawEmoji;

    // Ten rengi uygulanabilir mi kontrol et
    if (selectedSkinTone) {
      const dbItem = EMOJI_DATABASE.find((item) => item.emoji === rawEmoji);
      if (dbItem?.supportsTone) {
        finalEmoji = rawEmoji + selectedSkinTone;
      }
    }

    onSelectEmoji(finalEmoji);

    // Son kullanılanları güncelle (maksimum 18 adet)
    setRecentEmojis((prev) => {
      const filtered = prev.filter((item) => item !== finalEmoji && item !== rawEmoji);
      const updated = [finalEmoji, ...filtered].slice(0, 18);
      try {
        localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("Recent emojis kaydedilemedi:", err);
      }
      return updated;
    });
  };

  // Kaomoji tıklandığında ekle
  const handleKaomojiClick = (text: string) => {
    onSelectEmoji(text);
  };

  // Ten rengi seçildiğinde
  const handleSelectSkinTone = (toneCode: string) => {
    setSelectedSkinTone(toneCode);
    setIsTonePickerOpen(false);
  };

  // Arama filtresi
  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.trim().toLowerCase();
    return EMOJI_DATABASE.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        item.emoji === query
    );
  }, [searchQuery]);

  // Kategoriye göre filtrelenmiş emojiler
  const currentCategoryEmojis = useMemo((): EmojiItem[] => {
    if (activeCategory === "recent") {
      return recentEmojis.map((e) => {
        const found = EMOJI_DATABASE.find((item) => item.emoji === e || e.startsWith(item.emoji));
        return {
          emoji: e,
          name: found ? found.name : "Son Kullanılan",
          category: "recent" as EmojiCategory,
          tags: [],
          supportsTone: found?.supportsTone || false,
        };
      });
    }
    return EMOJI_DATABASE.filter((item) => item.category === activeCategory);
  }, [activeCategory, recentEmojis]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Gelişmiş Emoji Klavyesi"
      className={`absolute z-50 select-none animate-in fade-in zoom-in-95 duration-200 ease-out ${
        anchorPosition === "bottom-left"
          ? "bottom-16 left-0 sm:left-1"
          : anchorPosition === "bottom-right"
          ? "bottom-16 right-0"
          : "top-14 left-0"
      } ${className}`}
    >
      {/* Kart Gövdesi: Glassmorphism + Grupo Teması */}
      <div className="w-[340px] sm:w-[380px] h-[430px] flex flex-col bg-slate-900/95 border border-slate-700/80 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.65)] backdrop-blur-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* ÜST BAŞLIK & SEKMELER */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-slate-800/80">
          {/* Sekme Butonları */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab("emoji");
                setSearchQuery("");
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "emoji"
                  ? "bg-slate-700/90 text-white shadow-sm ring-1 ring-white/10"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Smile className="w-3.5 h-3.5 text-amber-400" />
              <span>Emojiler</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("kaomoji");
                setSearchQuery("");
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "kaomoji"
                  ? "bg-slate-700/90 text-white shadow-sm ring-1 ring-white/10"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>Kaomoji</span>
            </button>
          </div>

          {/* Sağ Aksiyonlar: Ten Rengi Seçici & Kapat Butonu */}
          <div className="flex items-center gap-1">
            {activeTab === "emoji" && (
              <div className="relative">
                <button
                  type="button"
                  title="Ten Rengi Seç"
                  onClick={() => setIsTonePickerOpen(!isTonePickerOpen)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-800/80 flex items-center justify-center text-sm transition-transform active:scale-95 cursor-pointer"
                >
                  <span>
                    {selectedSkinTone
                      ? SKIN_TONES.find((t) => t.code === selectedSkinTone)?.sample || "👋"
                      : "👋"}
                  </span>
                </button>

                {/* Ten Rengi Açılır Menüsü */}
                {isTonePickerOpen && (
                  <div className="absolute right-0 top-9 p-1.5 bg-slate-900 border border-slate-700/80 rounded-xl shadow-xl z-50 flex items-center gap-1 animate-in fade-in zoom-in-95 duration-100">
                    {SKIN_TONES.map((tone) => (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => handleSelectSkinTone(tone.code)}
                        title={tone.label}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:scale-125 transition-transform cursor-pointer ${
                          selectedSkinTone === tone.code
                            ? "bg-slate-700 ring-2 ring-amber-400"
                            : "hover:bg-slate-800"
                        }`}
                      >
                        {tone.sample}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Kapat (Esc)"
              className="w-7 h-7 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CANLI ARAMA ÇUBUĞU */}
        <div className="px-3 pt-2.5 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === "emoji"
                  ? "Emoji ara... (örn: gül, kalp, ateş, selam)"
                  : "İfade ara..."
              }
              className="w-full bg-slate-800/80 border border-slate-700/60 focus:border-amber-400/70 rounded-xl py-1.5 pl-8 pr-7 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* KATEGORİ NAVİGASYONU (Sadece Arama Yokken ve Emoji Sekmesinde) */}
        {activeTab === "emoji" && !searchQuery.trim() && (
          <div className="flex items-center px-2 py-1 gap-0.5 border-b border-slate-800/60 overflow-x-auto scrollbar-none">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollTop = 0;
                    }
                  }}
                  title={cat.label}
                  className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                    isActive
                      ? "text-amber-400 bg-amber-400/10 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}

        {/* EMOJİ VEYA KAOMOJI İÇERİK ALANI */}
        <div
          ref={scrollContainerRef}
          className="flex-1 px-2.5 py-2 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent space-y-3"
        >
          {/* DURUM 1: ARAMA SONUÇLARI */}
          {searchQuery.trim() ? (
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2">
                Arama Sonuçları ({filteredEmojis.length})
              </div>
              {filteredEmojis.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="text-3xl mb-2">🔍</div>
                  <p className="text-xs font-medium">Eşleşen emoji bulunamadı</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Farklı bir anahtar kelime deneyin (örn: &quot;kalp&quot;, &quot;gül&quot;)
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                  {filteredEmojis.map((item, idx) => {
                    const displayEmoji =
                      selectedSkinTone && (item as any).supportsTone
                        ? item.emoji + selectedSkinTone
                        : item.emoji;
                    return (
                      <button
                        key={`${item.emoji}-${idx}`}
                        type="button"
                        onClick={() => handleEmojiClick(item.emoji, item.name)}
                        onMouseEnter={() =>
                          setHoveredEmoji({ emoji: displayEmoji, name: item.name })
                        }
                        onMouseLeave={() => setHoveredEmoji(null)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl hover:bg-slate-800/90 hover:scale-125 active:scale-95 transition-all duration-150 cursor-pointer select-none"
                      >
                        {displayEmoji}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === "emoji" ? (
            /* DURUM 2: EMOJİ KATEGORİSİ */
            <div>
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  {CATEGORIES.find((c) => c.id === activeCategory)?.label || "Emojiler"}
                </span>
                <span className="text-[10px] text-slate-400">
                  {currentCategoryEmojis.length} emoji
                </span>
              </div>

              {currentCategoryEmojis.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Henüz son kullanılan emoji yok</p>
                  <p className="text-[10px] text-slate-500">
                    Sohbette kullandığınız emojiler burada listelenecektir.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                  {currentCategoryEmojis.map((item, idx) => {
                    const displayEmoji =
                      selectedSkinTone && (item as any).supportsTone
                        ? item.emoji + selectedSkinTone
                        : item.emoji;
                    return (
                      <button
                        key={`${item.emoji}-${idx}`}
                        type="button"
                        onClick={() => handleEmojiClick(item.emoji, item.name)}
                        onMouseEnter={() =>
                          setHoveredEmoji({ emoji: displayEmoji, name: item.name })
                        }
                        onMouseLeave={() => setHoveredEmoji(null)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl hover:bg-slate-800/90 hover:scale-125 active:scale-95 transition-all duration-150 cursor-pointer select-none"
                      >
                        {displayEmoji}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* DURUM 3: KAOMOJI SEKMESİ */
            <div className="space-y-3.5">
              {KAOMOJIS.map((group) => (
                <div key={group.category}>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">
                    {group.category}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.list.map((km, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleKaomojiClick(km)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 text-xs text-slate-200 hover:text-white font-mono transition-all text-center truncate cursor-pointer hover:shadow-sm"
                      >
                        {km}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ALT BİLGİ / ÖNİZLEME ÇUBUĞU (FOOTER PREVIEW - WhatsApp / Discord Stili) */}
        <div className="h-11 px-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-xs">
          {hoveredEmoji ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-2xl flex-shrink-0 animate-in zoom-in-75 duration-100">
                {hoveredEmoji.emoji}
              </span>
              <span className="text-slate-300 font-medium truncate text-xs">
                {hoveredEmoji.name}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              <span className="text-amber-400 font-bold">✨ Aura</span>
              <span>Bir emojiye tıklayarak mesaja ekleyin</span>
            </div>
          )}

          {activeTab === "emoji" && (
            <div className="text-[10px] text-slate-400 hidden sm:block">
              {selectedSkinTone ? "Ten tonu aktif" : "Standart"}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
