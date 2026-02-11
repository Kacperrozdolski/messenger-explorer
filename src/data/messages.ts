import sample1 from "@/assets/sample-1.jpg";
import sample2 from "@/assets/sample-2.jpg";
import sample3 from "@/assets/sample-3.jpg";
import sample4 from "@/assets/sample-4.jpg";
import sample5 from "@/assets/sample-5.jpg";
import sample6 from "@/assets/sample-6.jpg";
import sample7 from "@/assets/sample-7.jpg";
import sample8 from "@/assets/sample-8.jpg";
import sample9 from "@/assets/sample-9.jpg";

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: string;
}

export interface ImageEntry {
  id: string;
  src: string;
  sender: string;
  timestamp: string;
  chat: string;
  chatType: "group" | "dm";
  fileType: "image" | "video" | "gif";
  contextBefore: ChatMessage[];
  contextAfter: ChatMessage[];
}

export interface ChatSource {
  name: string;
  type: "group" | "dm";
  photoCount: number;
}

export const chatSources: ChatSource[] = [
  { name: "College Friends 🎓", type: "group", photoCount: 42 },
  { name: "Family Group", type: "group", photoCount: 156 },
  { name: "Work Team", type: "group", photoCount: 23 },
  { name: "Travel Buddies ✈️", type: "group", photoCount: 87 },
  { name: "Alex Rivera", type: "dm", photoCount: 34 },
  { name: "Jordan Chen", type: "dm", photoCount: 18 },
  { name: "Sam Nakamura", type: "dm", photoCount: 7 },
];

export const senders = ["Alex Rivera", "Jordan Chen", "Sam Nakamura", "Priya Sharma", "Marcus Bell", "Elena Voss"];

export const imageEntries: ImageEntry[] = [
  {
    id: "1",
    src: sample1,
    sender: "Alex Rivera",
    timestamp: "2023-09-14T18:32:00",
    chat: "Travel Buddies ✈️",
    chatType: "group",
    fileType: "image",
    contextBefore: [
      { sender: "Jordan Chen", text: "Are we still hiking tomorrow morning?", timestamp: "2023-09-14T18:28:00" },
      { sender: "Alex Rivera", text: "Absolutely! The forecast looks incredible", timestamp: "2023-09-14T18:30:00" },
      { sender: "Priya Sharma", text: "I'm packing snacks for everyone 🎒", timestamp: "2023-09-14T18:31:00" },
    ],
    contextAfter: [
      { sender: "Jordan Chen", text: "WOW that golden hour is unreal 😍", timestamp: "2023-09-14T18:33:00" },
      { sender: "Sam Nakamura", text: "This is wallpaper material", timestamp: "2023-09-14T18:34:00" },
      { sender: "Priya Sharma", text: "Can you send the full res version?", timestamp: "2023-09-14T18:35:00" },
    ],
  },
  {
    id: "2",
    src: sample2,
    sender: "Jordan Chen",
    timestamp: "2023-11-02T14:15:00",
    chat: "Work Team",
    chatType: "group",
    fileType: "image",
    contextBefore: [
      { sender: "Marcus Bell", text: "Has anyone been to the new office downtown?", timestamp: "2023-11-02T14:10:00" },
      { sender: "Jordan Chen", text: "Just went there for a meeting", timestamp: "2023-11-02T14:12:00" },
      { sender: "Elena Voss", text: "How's the architecture?", timestamp: "2023-11-02T14:14:00" },
    ],
    contextAfter: [
      { sender: "Elena Voss", text: "Those glass panels are stunning!", timestamp: "2023-11-02T14:16:00" },
      { sender: "Marcus Bell", text: "Modern brutalism at its finest", timestamp: "2023-11-02T14:18:00" },
      { sender: "Jordan Chen", text: "The lobby is even better in person", timestamp: "2023-11-02T14:20:00" },
    ],
  },
  {
    id: "3",
    src: sample3,
    sender: "Sam Nakamura",
    timestamp: "2023-07-22T09:45:00",
    chat: "College Friends 🎓",
    chatType: "group",
    fileType: "image",
    contextBefore: [
      { sender: "Alex Rivera", text: "Who's awake this early on vacation?", timestamp: "2023-07-22T09:40:00" },
      { sender: "Sam Nakamura", text: "Me! The coast is incredible at dawn", timestamp: "2023-07-22T09:42:00" },
      { sender: "Priya Sharma", text: "Share photos!!!", timestamp: "2023-07-22T09:44:00" },
    ],
    contextAfter: [
      { sender: "Alex Rivera", text: "The power of those waves 🌊", timestamp: "2023-07-22T09:46:00" },
      { sender: "Priya Sharma", text: "I can hear this photo", timestamp: "2023-07-22T09:47:00" },
      { sender: "Jordan Chen", text: "Adding this to the trip album", timestamp: "2023-07-22T09:50:00" },
    ],
  },
  {
    id: "4",
    src: sample4,
    sender: "Priya Sharma",
    timestamp: "2023-10-08T16:20:00",
    chat: "Alex Rivera",
    chatType: "dm",
    fileType: "image",
    contextBefore: [
      { sender: "Alex Rivera", text: "How was the nature reserve?", timestamp: "2023-10-08T16:15:00" },
      { sender: "Priya Sharma", text: "Absolutely magical. So quiet.", timestamp: "2023-10-08T16:17:00" },
      { sender: "Priya Sharma", text: "Look who I found hiding in the leaves", timestamp: "2023-10-08T16:19:00" },
    ],
    contextAfter: [
      { sender: "Alex Rivera", text: "A FOX!!! 🦊🦊🦊", timestamp: "2023-10-08T16:21:00" },
      { sender: "Alex Rivera", text: "How close were you?", timestamp: "2023-10-08T16:22:00" },
      { sender: "Priya Sharma", text: "Maybe 10 feet? It wasn't scared at all", timestamp: "2023-10-08T16:24:00" },
    ],
  },
  {
    id: "5",
    src: sample5,
    sender: "Marcus Bell",
    timestamp: "2024-01-15T11:00:00",
    chat: "Travel Buddies ✈️",
    chatType: "group",
    fileType: "image",
    contextBefore: [
      { sender: "Elena Voss", text: "Marcus, are you flying the drone again?", timestamp: "2024-01-15T10:55:00" },
      { sender: "Marcus Bell", text: "You know it 😎", timestamp: "2024-01-15T10:57:00" },
      { sender: "Sam Nakamura", text: "Get a shot of the river bend!", timestamp: "2024-01-15T10:59:00" },
    ],
    contextAfter: [
      { sender: "Sam Nakamura", text: "That aerial perspective is insane", timestamp: "2024-01-15T11:02:00" },
      { sender: "Elena Voss", text: "The winding river through the forest 😮", timestamp: "2024-01-15T11:03:00" },
      { sender: "Alex Rivera", text: "This could be a National Geographic cover", timestamp: "2024-01-15T11:05:00" },
    ],
  },
  {
    id: "6",
    src: sample6,
    sender: "Elena Voss",
    timestamp: "2024-03-28T15:45:00",
    chat: "Family Group",
    chatType: "group",
    fileType: "image",
    contextBefore: [
      { sender: "Priya Sharma", text: "The cherry blossoms should be blooming!", timestamp: "2024-03-28T15:40:00" },
      { sender: "Elena Voss", text: "They are! I'm walking through the park now", timestamp: "2024-03-28T15:42:00" },
      { sender: "Marcus Bell", text: "Take photos please!!", timestamp: "2024-03-28T15:44:00" },
    ],
    contextAfter: [
      { sender: "Marcus Bell", text: "Spring has arrived 🌸", timestamp: "2024-03-28T15:46:00" },
      { sender: "Priya Sharma", text: "This is absolutely dreamy", timestamp: "2024-03-28T15:47:00" },
      { sender: "Jordan Chen", text: "We need a group outing there ASAP", timestamp: "2024-03-28T15:50:00" },
    ],
  },
  {
    id: "7",
    src: sample7,
    sender: "Jordan Chen",
    timestamp: "2023-12-31T23:58:00",
    chat: "College Friends 🎓",
    chatType: "group",
    fileType: "image",
    contextBefore: [
      { sender: "Alex Rivera", text: "HAPPY NEW YEAR'S EVE!! 🎉", timestamp: "2023-12-31T23:50:00" },
      { sender: "Sam Nakamura", text: "The city is electric tonight", timestamp: "2023-12-31T23:55:00" },
      { sender: "Jordan Chen", text: "Look at these streets", timestamp: "2023-12-31T23:57:00" },
    ],
    contextAfter: [
      { sender: "Alex Rivera", text: "The neon reflections on the wet street 🤩", timestamp: "2023-12-31T23:59:00" },
      { sender: "Priya Sharma", text: "HAPPY NEW YEAR!!! 🥳🥳🥳", timestamp: "2024-01-01T00:00:00" },
      { sender: "Sam Nakamura", text: "2024 LET'S GOOO", timestamp: "2024-01-01T00:01:00" },
    ],
  },
  {
    id: "8",
    src: sample8,
    sender: "Alex Rivera",
    timestamp: "2024-02-10T17:30:00",
    chat: "Sam Nakamura",
    chatType: "dm",
    fileType: "image",
    contextBefore: [
      { sender: "Sam Nakamura", text: "How's the desert road trip?", timestamp: "2024-02-10T17:25:00" },
      { sender: "Alex Rivera", text: "Otherworldly. Pure silence out here.", timestamp: "2024-02-10T17:27:00" },
      { sender: "Alex Rivera", text: "Caught the sunset from the dunes", timestamp: "2024-02-10T17:29:00" },
    ],
    contextAfter: [
      { sender: "Sam Nakamura", text: "That solitude looks therapeutic", timestamp: "2024-02-10T17:32:00" },
      { sender: "Sam Nakamura", text: "The color gradient in the sky... wow", timestamp: "2024-02-10T17:33:00" },
      { sender: "Alex Rivera", text: "Best decision I've made all year", timestamp: "2024-02-10T17:35:00" },
    ],
  },
  {
    id: "9",
    src: sample9,
    sender: "Elena Voss",
    timestamp: "2024-01-20T22:15:00",
    chat: "Travel Buddies ✈️",
    chatType: "group",
    fileType: "image",
    contextBefore: [
      { sender: "Marcus Bell", text: "Elena you're in Iceland right now??", timestamp: "2024-01-20T22:10:00" },
      { sender: "Elena Voss", text: "YES and the aurora just appeared!!!", timestamp: "2024-01-20T22:12:00" },
      { sender: "Priya Sharma", text: "NO WAY share share share", timestamp: "2024-01-20T22:14:00" },
    ],
    contextAfter: [
      { sender: "Marcus Bell", text: "I am genuinely speechless", timestamp: "2024-01-20T22:16:00" },
      { sender: "Priya Sharma", text: "This is bucket list material 💚", timestamp: "2024-01-20T22:17:00" },
      { sender: "Sam Nakamura", text: "Pack me in your suitcase next time", timestamp: "2024-01-20T22:20:00" },
    ],
  },
];

export type SortOption = "date-desc" | "date-asc" | "sender";
export type ViewMode = "grid" | "list";
export type FileTypeFilter = "all" | "image" | "video" | "gif";
