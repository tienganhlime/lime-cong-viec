// ============================================================
//  CẤU HÌNH FIREBASE
//  1. Vào https://console.firebase.google.com, tạo dự án mới.
//  2. Bật Authentication > Sign-in method > Email/Password.
//  3. Tạo Firestore Database (chế độ production), rồi dán nội dung file
//     firestore.rules vào tab Rules và bấm Publish.
//  4. Project settings > Your apps > Web (</>) > copy đoạn firebaseConfig
//     và dán đè vào biến FIREBASE_CONFIG bên dưới (thay chữ null).
//  Khi FIREBASE_CONFIG còn là null, web chạy ở CHẾ ĐỘ CHẠY THỬ:
//  dữ liệu chỉ lưu trong trình duyệt của máy bạn, dùng để xem thử giao diện.
// ============================================================
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCDPbql5Im3gPQpIaZPxYCAxhnhSJeRgZ8",
  authDomain: "lime-chuyen-mon-noi-bo.firebaseapp.com",
  projectId: "lime-chuyen-mon-noi-bo",
  storageBucket: "lime-chuyen-mon-noi-bo.firebasestorage.app",
  messagingSenderId: "282875029929",
  appId: "1:282875029929:web:5ad71bc710fb297dc5bcb8"
};

/* Ví dụ sau khi dán:
export const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "ten-du-an.firebaseapp.com",
  projectId: "ten-du-an",
  storageBucket: "ten-du-an.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/

export const FACILITIES = [
  { id: 'yenhoa', name: 'Yên Hòa' },
  { id: 'trunghoa', name: 'Trung Hòa' },
];
