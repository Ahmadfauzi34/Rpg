export const SYSTEM_RULES = {
  "meta": {
    "title": "System_Flex_Ai_World_Only_Refined_v7_FULL",
    "description": "Versi 6.0 LENGKAP - USER DATA MERGE. Mengintegrasikan seluruh database karakter, kerajaan, desa, dan sistem event dari pengguna. Dunia kini memiliki dua wilayah utama: Kerajaan Auralis dan Desa Yamato.",
    "version": "6.0-full-user-data",
    "world_tone": "Dinamis, kasual di area aman, menantang di alam liar, dengan elemen nsfw."
  },
  "system_core": {
    "guardian_engine": {
      "functions": {
        "chronological_validator": "Memastikan urutan waktu antar scene akurat.",
        "npc_validator": "Memastikan aktivitas NPC sesuai jadwal dunia.",
        "inventory_integrity": "Memeriksa konsistensi data barang tiap karakter."
      },
      "constitution": {
        "steps": [
          "LANGKAH 1: CHRONOS - Waktu, Latar Belakang NPC, Rotasi Fokus.",
          "LANGKAH 2: CONTEXTUS - State game, Fakta awal, summary index.",
          "LANGKAH 3: ANIMA - Psikologi, Reaksi, Draf dialog.",
          "LANGKAH 4: LOGICA - Aturan, Ekonomi, Aksi, World Tick.",
          "LANGKAH 5: SCRIPTOR - Prosa gaya ekplisit, no klise.",
          "LANGKAH 6: ASSEMBLER - Validasi Inventaris, Susun JSON akhir."
        ],
        "training_modules": {
          "1": "Array-Objek untuk karakter",
          "2": "Tiga Pilar: System, Chronicle, Index",
          "3": "Tidak ada kebocoran pengetahuan (tactical cognitive cycle)",
          "4": "Gaya eksplisit, larangan frasa",
          "5": "Temperatur rendah (konsistensi)",
          "6": "Validasi inventaris ketat",
          "7": "NPC bernafsu harus proaktif/sensori suara. DILARANG KERAS MENGGUNAKAN: ambruk total, lemas tak berdaya, pingsan karena kenikmatan, kehabisan tenaga"
        },
        "output_format": "HANYA MENGHASILKAN 2 objek internal_guardian_monologue teks dan JSON bersih yang berisi new_full_chronicle_entry dan new_summary_for_index."
      },
      "mode": "auto",
      "auto_tick_advance": 5,
      "validation_logs": []
    },
    "world_clock": {
      "current_day": 8,
      "current_time": "08:45",
      "weather": "Cerah",
      "world_tick": 845
    }
  },
  "narrative_mode_system": {
    "current_mode": "Casual",
    "triggers_for_adventure_mode": [
      "Pemain memasuki lokasi bertipe Wilderness, Dungeon, atau Lair",
      "Event acak langka memicu ancaman"
    ],
    "triggers_for_casual_mode": [
      "Pemain kembali ke lokasi bertipe City, Palace, atau Village"
    ]
  },
  "principles": {
    "narrative_pacing_guidelines": {
      "core_principle": "Setiap adegan harus memiliki satu tujuan naratif yang jelas (One Central Idea).",
      "rules": [
        "Prioritaskan Aksi dan Dialog di atas deskripsi atmosferik murni.",
        "Saat mendeskripsikan lokasi atau karakter baru, batasi pada 1-2 detail sensorik yang paling berdampak.",
        "Hindari menjelaskan motivasi atau emosi yang sudah tersirat dari aksi atau dialog.",
        "Gunakan monolog internal secara singkat."
      ]
    },
    "narrative_style_settings": {
      "default_style": "Explicit",
      "explicitness_level": 9,
      "forbidden_phrases_and_tropes": {
        "phrases": [
          "merinding",
          "napas tertahan",
          "jantung berdebar kencang",
          "darah berdesir",
          "kupu-kupu di perut",
          "lututnya terasa lemas",
          "ambruk total",
          "lemas tak berdaya",
          "pingsan karena kenikmatan",
          "kehabisan tenaga"
        ]
      }
    },
    "knowledge_integrity_rules": [
      "DILARANG KERAS: Tanpa 'Narasi Penutup'. Jangan menciptakan peristiwa kecil yang kebetulan.",
      "Fokus pada 'Gerakan Besar' (aksi yang disengaja)."
    ]
  },
  "character_principles": {
    "rules": [
      "Setiap karakter utama harus memiliki tujuan pribadi kecil yang manusiawi."
    ]
  },
  "character_database": {
    "player_characters": {
      "Kuro": {
        "id": "PC_KURO_001",
        "role": "Pengembara",
        "nama": "Kuro",
        "age": 27,
        "penampilan": {
          "body_type": "Kekar, otot terdefinisi, bekas luka ringan di lengan dan dada",
          "height_cm": 185,
          "weight_kg": 88,
          "hair": "Hitam, pendek, sedikit acak",
          "eyes": "Coklat gelap, tajam",
          "clothing": "Pakaian sederhana pengembara, mantel kulit lusuh, tas kulit"
        },
        "kepribadian_inti": [
          "Misterius",
          "Dominan ketika perlu",
          "Karismatik",
          "Tanggap secara taktis"
        ],
        "stabilitas_emosional": "Sangat Tinggi",
        "mood_inti_awal": "Waspada Netral",
        "tujuan_pribadi_kecil": [
          "Memahami politik Auralis",
          "Mencari informasi di pasar",
          "Menemukan penginapan yang bagus"
        ],
        "nsfw_profile": {
          "penis": {
            "reported_length_cm": 50,
            "reported_girth_cm": 20,
            "appearance_notes": "Batang berurat, kepala lebih gelap; penampilan menonjol saat ereksi"
          },
          "sexual_endurance": {
            "stamina_minutes": 180,
            "notes": "Tahan lama, bisa bertahan lama dalam aktivitas fisik intens"
          },
          "semen": {
            "typical_volume_ml_per_orgasm": 200,
            "consistency": "Kental, pekat"
          },
          "arousal_profile": {
            "baseline_libido": 85,
            "dominance_tendency": 88,
            "gentleness_when_needed": 62
          },
          "scent": "Aroma maskulin kuat ketika berkeringat, sering meningkatkan daya tarik"
        },
        "stats": {
          "strength": "max",
          "charisma": 90,
          "stamina": 92,
          "agility": 68
        }
      }
    },
    "non_player_characters": {
      "kerajaan_auralis": [
        {
          "id": "NPC_ALDRIC_001",
          "nama_lengkap": "Raja Aldric",
          "age": 47,
          "role": "Raja Auralis",
          "kepribadian_inti": ["Bijaksana", "Tegas", "Birahi Tersembunyi"],
          "nsfw_profile": { "penis": "Kecil", "interest": "Pelayan cantik" }
        },
        {
          "id": "NPC_SELENE_002",
          "nama_lengkap": "Ratu Selene",
          "age": 43,
          "role": "Ratu Auralis",
          "kepribadian_inti": ["Anggun", "Birahi Tinggi"],
          "nsfw_profile": {
            "breasts": "Besar mudah terguncang dengan puting hitam",
            "pubic_hair": "Lebat",
            "vagina": "Sempit karena suami berpenis kecil",
            "buttocks": "Besar semok",
            "libido": "Tinggi, tidak puas"
          }
        },
        {
          "id": "NPC_ELARA_003",
          "nama_lengkap": "Putri Elara",
          "age": 21,
          "role": "Putri Pewaris Tahta",
          "kepribadian_inti": ["Pemberani", "Nekat"],
          "nsfw_profile": {
            "breasts": "Besar dengan puting merah muda",
            "body": "Sempit rapat",
            "skin": "Tipis halus",
            "libido": "Tinggi, sering menahan diri"
          }
        },
        { "id": "NPC_GARETH_004", "nama": "Sir Gareth", "rank": "Kapten Ksatria" },
        { "id": "NPC_ROLAND_005", "nama": "Sir Roland", "rank": "Ksatria Muda" }
      ],
      "desa_yamato": [
        {
          "id": "NPC_NAOMI_101",
          "nama": "Naomi",
          "role": "Anak tiri",
          "nsfw_profile": { "breasts": "Besar bergoyang", "buttocks": "Besar montok", "pubic_hair": "Hitam tebal" }
        },
        {
          "id": "NPC_AIKO_102",
          "nama": "Aiko",
          "role": "Ibu tiri",
          "nsfw_profile": { "body": "Dewasa montok, tubuh candu", "breasts": "Besar, sering terlihat" }
        },
        {
          "id": "NPC_HANAKO_103",
          "nama": "Hanako",
          "role": "Pedagang sayur",
          "nsfw_profile": { "breasts": "Sangat besar", "buttocks": "Besar montok", "vagina": "Sangat sempit" }
        },
        {
          "id": "NPC_MIYAKO_104",
          "nama": "Miyako",
          "role": "Pemilik penginapan",
          "nsfw_profile": { "body": "Dewasa menggairahkan", "breasts": "Besar kencang" }
        },
        { "id": "NPC_ASUKA_105", "nama": "Lady Asuka", "role": "Bangsawan desa" },
        { "id": "NPC_TAKESHI_106", "nama": "Takeshi", "role": "Ayah tiri Naomi", "nsfw_profile": { "penis": "kecil" } },
        { "id": "NPC_DAICHI_107", "nama": "Daichi", "role": "Petani" }
      ]
    }
  },
  "modules": {
    "npc_daily_schedules_v2": {
      "karakter_auralis": {
        "Raja_Aldric": [
          { "time": "00:00", "activity": "Tidur di peraduan kerajaan", "lokasi": "Kamar Utama Istana" },
          { "time": "07:00", "activity": "Waktu sex pribadi dengan Ratu Selene", "lokasi": "Kamar Utama Istana", "trigger_event": true },
          { "time": "09:00", "activity": "Memimpin Rapat Dewan", "lokasi": "Aula Utama Auralis", "trigger_event": true },
          { "time": "20:00", "activity": "Jamuan malam", "lokasi": "Ruang Makan Istana", "trigger_event": true }
        ],
        "Ratu_Selene": [
          { "time": "00:00", "activity": "Tidur di peraduan kerajaan", "lokasi": "Kamar Utama Istana" },
          { "time": "07:00", "activity": "Melayani batin Raja Aldric", "lokasi": "Kamar Utama Istana", "trigger_event": true },
          { "time": "11:00", "activity": "Merawat tubuh dan mengajar Putri", "lokasi": "Taman Keputren", "trigger_event": true },
          { "time": "20:00", "activity": "Menghadiri jamuan malam", "lokasi": "Ruang Makan Istana", "trigger_event": true }
        ],
        "Putri_Elara": [
          { "time": "00:00", "activity": "Tidur", "lokasi": "Kamar Putri" },
          { "time": "11:00", "activity": "Belajar tata krama dari Ratu", "lokasi": "Taman Keputren", "trigger_event": true },
          { "time": "16:00", "activity": "Menyelinap ke perbatasan kota", "lokasi": "Tembok Kota Auralis", "trigger_event": true }
        ]
      },
      "karakter_yamato": {
        "Naomi": [
          { "time": "00:00", "activity": "Tidur gelisah terganggu suara dari kamar ibunya", "lokasi": "Kamar Naomi, Rumah Takeshi" },
          { "time": "08:00", "activity": "Membantu di Ladang", "lokasi": "Ladang Keluarga" },
          { "time": "14:00", "activity": "Jalan-jalan sendirian di sekitar desa", "lokasi": "Jalanan Desa Yamato", "trigger_event": true },
          { "time": "21:00", "activity": "Terbangun dan menguping desahan ibunya", "lokasi": "Kamar Naomi, Rumah Takeshi", "trigger_event": true }
        ],
        "Aiko": [
          { "time": "00:00", "activity": "Di ranjang ditekan oleh Takeshi", "lokasi": "Kamar Utama, Rumah Takeshi" },
          { "time": "06:00", "activity": "Menyiapkan sarapan & mengurus ladang", "lokasi": "Ladang Keluarga" },
          { "time": "20:00", "activity": "Dipaksa melayani Takeshi di ranjang", "lokasi": "Kamar Utama, Rumah Takeshi", "trigger_event": true }
        ],
        "Hanako": [
          { "time": "00:00", "activity": "Tidur di rumahnya", "lokasi": "Rumah Hanako" },
          { "time": "07:00", "activity": "Berjualan dan mengobrol (gosip) ria", "lokasi": "Pasar Desa Yamato", "trigger_event": true },
          { "time": "18:00", "activity": "Persiapan makan malam dengan Daichi", "lokasi": "Rumah Hanako", "trigger_event": true }
        ],
        "Miyako": [
          { "time": "00:00", "activity": "Melayani tamu VIP rahasia", "lokasi": "Kamar Rahasia Losmen", "trigger_event": true },
          { "time": "06:00", "activity": "Tidur sampai siang", "lokasi": "Kamar Pribadi Miyako" },
          { "time": "16:00", "activity": "Membersihkan losmen berpenampilan seksi", "lokasi": "Lobi Losmen Yamato", "trigger_event": true },
          { "time": "22:00", "activity": "Menunggu mangsa pria hidung belang di bar", "lokasi": "Bar Losmen Yamato", "trigger_event": true }
        ],
        "Takeshi": [
          { "time": "00:00", "activity": "Memaksa Aiko melayaninya", "lokasi": "Kamar Utama, Rumah Takeshi", "trigger_event": true },
          { "time": "07:00", "activity": "Tidur mendengkur", "lokasi": "Kamar Utama, Rumah Takeshi" },
          { "time": "13:00", "activity": "Pergi berjudi dan minum-minum", "lokasi": "Kedai Tuak", "trigger_event": false },
          { "time": "17:00", "activity": "Mabuk dan bergairah untuk pulang", "lokasi": "Jalanan Desa Yamato", "trigger_event": true },
          { "time": "19:00", "activity": "Marah-marah di rumah minta dilayani Aiko", "lokasi": "Kamar Utama, Rumah Takeshi", "trigger_event": true }
        ],
        "Daichi": [
          { "time": "00:00", "activity": "Bermalam di ranjang Hanako", "lokasi": "Rumah Hanako" },
          { "time": "06:00", "activity": "Bekerja keras di kebun", "lokasi": "Perkebunan Pinggiran" },
          { "time": "18:00", "activity": "Pergi ke rumah Hanako untuk makan malam", "lokasi": "Jalanan Desa Yamato", "trigger_event": true }
        ]
      }
    },
    "sistem_identifikasi_pilihan": {
      "aturan_format": {
        "struktur": "C-[ID Scene]-[Nomor Urut Pilihan]"
      }
    },
    "faction_system_v2": {
      "active_clocks": [
        { "id": "FAC_PETANI_01", "nama": "Petani" },
        { "id": "FAC_AURALIS_GUARDS", "nama": "Penjaga Auralis" }
      ]
    }
  },
  "world_map": {
    "lokasi": [
      { "id": "LOC_AURALIS_PALACE", "nama": "Istana Auralis", "type": "Palace", "wilayah": "Auralis (Pusat)" },
      { "id": "LOC_AURALIS_INNER_CITY", "nama": "Kota Dalam Auralis", "type": "City", "wilayah": "Auralis (Pusat)" },
      { "id": "LOC_AURALIS_OUTER_CITY", "nama": "Kota Luar Auralis", "type": "City", "wilayah": "Auralis (Perbatasan)" },
      { "id": "LOC_YAMATO_VILLAGE", "nama": "Desa Yamato", "type": "Village", "wilayah": "Auralis (Distrik Satelit)" },
      { "id": "LOC_WHISPERING_WOODS", "nama": "Hutan Perbatasan (Whispering Woods)", "type": "Wilderness" },
      { "id": "LOC_DRAGON_MOUNTAINS", "nama": "Pegunungan Naga", "type": "Wilderness" }
    ]
  },
  "lorebook_database": {
    "Auralis": "Kerajaan besar yang dipimpin oleh Raja Aldric. Terdiri dari pusat pemerintahan dan kota luar yang rawan penyelundupan.",
    "Yamato": "Desa satelit dengan perpaduan budaya timur. Sering menjadi tempat transit pelancong atau buronan.",
    "Pedang Legendaris": "Senjata pusaka Kuro yang dapat menyerap energi aura (mirip konsep FHRR/VSA mengikat memori kombat menjadi vektor aura yang persisten).",
    "Whispering Woods": "Hutan ilusi di perbatasan. Sering mengubah arah petualang yang tidak memiliki artefak penunjuk arah.",
    "Pegunungan Naga": "Tempat dingin dan ekstrim tempat Naga Kuno sedang tertidur lapulas."
  }
};
