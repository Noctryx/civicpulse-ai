importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "gen-lang-client-0452864218",
  appId: "1:1092231268712:web:79fad70ea9ecb5492eaedd",
  apiKey: "AIzaSyAabhiTyfNIDPzdI08tcWqj5J4JRNqw_jo",
  authDomain: "gen-lang-client-0452864218.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-19ea99b1-ecf0-4c28-ae07-4ceb923079a3",
  storageBucket: "gen-lang-client-0452864218.firebasestorage.app",
  messagingSenderId: "1092231268712"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title || "CivicPulse Update";
  const notificationOptions = {
    body: payload.notification.body || "There has been an update to your report.",
    icon: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
