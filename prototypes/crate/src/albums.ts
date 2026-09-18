// PROTOTYPE mock data. Real albums come from Music Assistant.
export type Track = { n: number; title: string; secs: number };
export type Album = {
  id: string;
  artist: string;
  title: string;
  year: number;
  hue: number;      // drives the procedural cover
  mark: number;     // which geometric mark
  tracks: Track[];
};

const T = (titles: string[]): Track[] =>
  titles.map((title, i) => ({ n: i + 1, title, secs: 150 + ((i * 47) % 190) }));

export const ALBUMS: Album[] = [
  { id: "a01", artist: "Sabaton", title: "The Art of War", year: 2008, hue: 18, mark: 0,
    tracks: T(["Sun Tzu Says","Ghost Division","The Art of War","40:1","Unbreakable","The Nature of Wars","Cliffs of Gallipoli","Talvisota","Panzerkampf","Union","The Price of a Mile","Firestorm","A Secret"]) },
  { id: "a02", artist: "Iron Maiden", title: "Powerslave", year: 1984, hue: 210, mark: 1,
    tracks: T(["Aces High","2 Minutes to Midnight","Losfer Words","Flash of the Blade","The Duellists","Back in the Village","Powerslave","Rime of the Ancient Mariner"]) },
  { id: "a03", artist: "Metallica", title: "Master of Puppets", year: 1986, hue: 0, mark: 2,
    tracks: T(["Battery","Master of Puppets","The Thing That Should Not Be","Welcome Home","Disposable Heroes","Leper Messiah","Orion","Damage, Inc."]) },
  { id: "a04", artist: "Kvelertak", title: "Meir", year: 2013, hue: 140, mark: 3,
    tracks: T(["Åpenbaring","Spring Fra Livet","Trepan","Månelyst","Evig Vandrar","Bruane Brenn","Snilepisk","Nekrokosmos","Undertro","Kvelertak"]) },
  { id: "a05", artist: "Karpe", title: "Heisann Montebello", year: 2016, hue: 280, mark: 4,
    tracks: T(["Attitudeproblem","Lett å være rebell","Hvite menn som pusher 50","Gunerius","Tusen tegninger","Au pair","Under bordet"]) },
  { id: "a06", artist: "Powerwolf", title: "Blessed & Possessed", year: 2015, hue: 320, mark: 5,
    tracks: T(["Blessed & Possessed","Army of the Night","Armata Strigoi","Higher Than Heaven","Dead Until Dark","Sanctus Dominus","Sacramental Sister","Christ & Combat"]) },
  { id: "a07", artist: "Nightwish", title: "Once", year: 2004, hue: 190, mark: 6,
    tracks: T(["Dark Chest of Wonders","Wish I Had an Angel","Nemo","Planet Hell","Creek Mary's Blood","The Siren","Dead Gardens","Romanticide","Ghost Love Score","Kuolema Tekee Taiteilijan","Higher Than Hope"]) },
  { id: "a08", artist: "Turbonegro", title: "Apocalypse Dudes", year: 1998, hue: 45, mark: 7,
    tracks: T(["The Age of Pamparius","Selfdestructo Bust","Get It On","Prince of the Rodeo","Rendezvous with Anus","Don't Say Motherfucker","Are You Ready","Back to Dungaree High","Zillion Pills","Rock Against Ass","Good Head"]) },
  { id: "a09", artist: "HammerFall", title: "Legacy of Kings", year: 1998, hue: 230, mark: 8,
    tracks: T(["Heeding the Call","Legacy of Kings","Let the Hammer Fall","Stronger Than All","Back to Back","The Fallen One","Remember Yesterday","At the End of the Rainbow","Dreamland"]) },
  { id: "a10", artist: "Gåte", title: "Iselilja", year: 2004, hue: 165, mark: 9,
    tracks: T(["Margit Hjukse","Bendik og Årolilja","Sjå Attende","Fedrekvad","Iselilja","Kjærleik","Under Fjellet"]) },
  { id: "a11", artist: "Mr. Pimp-Lotion", title: "Lotion's Eleven", year: 2019, hue: 300, mark: 10,
    tracks: T(["Baris","Fantomet","Sydenfyll","Kebabnorsk","Nattbuss","Lommerusk"]) },
  { id: "a12", artist: "Motorpsycho", title: "Timothy's Monster", year: 1994, hue: 95, mark: 11,
    tracks: T(["Feel","Nothing to Say","Sailing On","Wearing Yr Smell","Mountain","Grindstone","Leech","Kill Devil Hills","The Wheel","Sunchild"]) },
  { id: "a13", artist: "Judas Priest", title: "Painkiller", year: 1990, hue: 8, mark: 12,
    tracks: T(["Painkiller","Hell Patrol","All Guns Blazing","Leather Rebel","Metal Meltdown","Night Crawler","Between the Hammer & the Anvil","A Touch of Evil","One Shot at Glory"]) },
  { id: "a14", artist: "Enslaved", title: "Below the Lights", year: 2003, hue: 255, mark: 13,
    tracks: T(["As Fire Swept Clean the Earth","The Crossing","Havenless","Queen of Night","Havenless II","A Darker Place"]) },
  { id: "a15", artist: "Wardruna", title: "Runaljod – Gap Var Ginnunga", year: 2009, hue: 30, mark: 14,
    tracks: T(["Ár var alda","Hagal","Bjarkan","Þurs","Dagr","Algir","Heimta","Jara"]) },
  { id: "a16", artist: "OnklP", title: "Слава", year: 2015, hue: 350, mark: 15,
    tracks: T(["Styggen på ryggen","Dødsengelen","Nattmat","Hodet over vannet","Blåmandag"]) },
  { id: "a17", artist: "Black Sabbath", title: "Paranoid", year: 1970, hue: 120, mark: 16,
    tracks: T(["War Pigs","Paranoid","Planet Caravan","Iron Man","Electric Funeral","Hand of Doom","Rat Salad","Fairies Wear Boots"]) },
  { id: "a18", artist: "Dimmu Borgir", title: "Enthrone Darkness Triumphant", year: 1997, hue: 265, mark: 17,
    tracks: T(["Mourning Palace","Spellbound","In Death's Embrace","Relinquishment of Spirit","The Night Masquerade","Tormentor of Christian Souls","Entrance","Master of Disharmony","Prudence's Fall","A Succubus in Rapture"]) },
  { id: "a19", artist: "Ramones", title: "Ramones", year: 1976, hue: 60, mark: 18,
    tracks: T(["Blitzkrieg Bop","Beat on the Brat","Judy Is a Punk","I Wanna Be Your Boyfriend","Chain Saw","Now I Wanna Sniff Some Glue","Loudmouth","Havana Affair"]) },
  { id: "a20", artist: "Ulver", title: "Bergtatt", year: 1995, hue: 205, mark: 19,
    tracks: T(["Capitel I","Capitel II","Capitel III","Capitel IV","Capitel V"]) },
];
