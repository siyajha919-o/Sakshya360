// Hindi strings. Keys are the English source strings used with t(); {placeholders} must be kept as-is.
// To add another language, copy this file and register it in i18n.js.
export default {
  // ---- navigation / common
  'My duties': 'मेरे कार्य', 'My reports': 'मेरी रिपोर्ट', Attendance: 'उपस्थिति', 'Video calls': 'वीडियो कॉल',
  Dashboard: 'डैशबोर्ड', CCTV: 'सीसीटीवी', 'Random VC': 'औचक वीडियो कॉल', Inspections: 'निरीक्षण', Grievances: 'शिकायतें', Feedback: 'प्रतिक्रिया',
  'Sign out': 'साइन आउट', 'Sign in': 'साइन इन', Project: 'परियोजना', 'Live CCTV': 'लाइव सीसीटीवी', 'Surprise inspection': 'औचक निरीक्षण',
  OK: 'ठीक है', Cancel: 'रद्द करें', Failed: 'विफल', Yes: 'हाँ', No: 'नहीं', Send: 'भेजें', 'Loading…': 'लोड हो रहा है…',
  Server: 'सर्वर', Email: 'ईमेल', Password: 'पासवर्ड', Online: 'ऑनलाइन', Offline: 'ऑफ़लाइन', Live: 'लाइव', LIVE: 'लाइव',

  // ---- login
  'Smart Monitoring & Inspection · DoSJE': 'स्मार्ट निगरानी एवं निरीक्षण · सामाजिक न्याय विभाग',
  'Officials & staff': 'अधिकारी एवं कर्मचारी', Beneficiary: 'लाभार्थी',
  'Demo accounts (password demo@123):': 'डेमो खाते (पासवर्ड demo@123):',
  'Registered beneficiaries can give feedback and report problems at their centre. Your complaint goes directly to the Department.':
    'पंजीकृत लाभार्थी अपने केंद्र के बारे में राय और शिकायत दे सकते हैं। आपकी शिकायत सीधे विभाग तक पहुँचती है।',
  'Mobile number': 'मोबाइल नंबर', 'OTP sent by SMS': 'SMS से भेजा गया OTP',
  'Demo mode – no SMS gateway configured. OTP: {code}': 'डेमो मोड – SMS गेटवे नहीं है। OTP: {code}',
  'Verify and sign in': 'सत्यापित करें और साइन इन करें', 'Change number': 'नंबर बदलें', 'Send OTP': 'OTP भेजें', 'Demo numbers:': 'डेमो नंबर:',

  // ---- inspector: duties
  '{n} surprise inspection(s) pending': '{n} औचक निरीक्षण बाकी',
  'Duties are assigned at random by the Division. Sites are not notified in advance.': 'कार्य विभाग द्वारा यादृच्छिक रूप से सौंपे जाते हैं। केंद्रों को पहले से सूचना नहीं दी जाती।',
  'Offline – showing duties saved {when}': 'ऑफ़लाइन – {when} को सहेजे गए कार्य दिखाए जा रहे हैं',
  '{n} report(s) waiting to upload. They will be sent automatically – tap to retry now.': '{n} रिपोर्ट अपलोड की प्रतीक्षा में। ये अपने-आप भेजी जाएँगी – अभी भेजने के लिए टैप करें।',
  'No pending duties. Pull down to refresh.': 'कोई कार्य बाकी नहीं। रीफ़्रेश के लिए नीचे खींचें।',
  Overdue: 'समय-सीमा पार', 'In progress': 'जारी', 'Due {date}': 'अंतिम तिथि {date}',
  '{km} km from base': 'मुख्यालय से {km} किमी', 'assigned {when}': '{when} को सौंपा गया', Navigate: 'रास्ता देखें', 'Start inspection': 'निरीक्षण शुरू करें',

  // ---- inspector: inspection
  'Location required': 'स्थान आवश्यक', 'Inspection reports must be geo-tagged.': 'निरीक्षण रिपोर्ट में स्थान (जियो-टैग) होना ज़रूरी है।',
  'Limit reached': 'सीमा पूरी', 'Up to 6 photos per report.': 'एक रिपोर्ट में अधिकतम 6 फ़ोटो।', 'Waiting for GPS lock': 'GPS की प्रतीक्षा…',
  'Camera error': 'कैमरा त्रुटि', 'Recording failed': 'रिकॉर्डिंग विफल', 'Capture at least one live photo': 'कम से कम एक लाइव फ़ोटो लें',
  'Enter the physical headcount': 'मौजूद लोगों की गिनती दर्ज करें', 'Mock location detected': 'नकली लोकेशन पकड़ी गई',
  'Disable mock-location apps to submit.': 'जमा करने के लिए मॉक-लोकेशन ऐप बंद करें।',
  'Saved offline': 'ऑफ़लाइन सहेजा गया',
  'No network. The report and its evidence are stored on this phone and will upload automatically when you are back online. The original inspection time is kept.':
    'नेटवर्क नहीं है। रिपोर्ट और साक्ष्य इस फ़ोन में सुरक्षित हैं और नेटवर्क आने पर अपने-आप अपलोड होंगे। निरीक्षण का मूल समय दर्ज रहेगा।',
  'Report submitted': 'रिपोर्ट जमा हुई', 'Submitted – outside geofence': 'जमा हुई – जियोफ़ेंस से बाहर',
  'Compliance {score}% · {n} evidence file(s) fingerprinted': 'अनुपालन {score}% · {n} साक्ष्य फ़ाइलें फ़िंगरप्रिंट की गईं',
  Signature: 'हस्ताक्षर', 'Open PDF': 'PDF खोलें', 'Submission failed': 'जमा करना विफल',
  'Location lock': 'स्थान पुष्टि', '±{acc} m · {dist} from site': '±{acc} मी · केंद्र से {dist}', 'Acquiring GPS…': 'GPS खोजा जा रहा है…',
  'Inside geofence': 'जियोफ़ेंस के अंदर', 'Outside geofence': 'जियोफ़ेंस से बाहर',
  'Demo: simulate being on site (flagged on the report)': 'डेमो: केंद्र पर होने का अनुकरण (रिपोर्ट पर अंकित होगा)',
  'Live evidence': 'लाइव साक्ष्य',
  'In-app camera only. GPS, time and inspector are stamped on every photo; every file is SHA-256 fingerprinted and duplicates are rejected.':
    'केवल ऐप का कैमरा। हर फ़ोटो पर GPS, समय और निरीक्षक का नाम छपता है; हर फ़ाइल का SHA-256 फ़िंगरप्रिंट बनता है और दोहराई गई फ़ाइलें अस्वीकार होती हैं।',
  'Allow camera': 'कैमरा की अनुमति दें', Photo: 'फ़ोटो', Stop: 'रोकें', 'Re-record': 'दोबारा रिकॉर्ड', '20s video': '20 सेकंड वीडियो',
  '{n} photo(s)': '{n} फ़ोटो', '1 video': '1 वीडियो', 'some photos could not be stamped': 'कुछ फ़ोटो पर मुहर नहीं लग सकी',
  Checklist: 'जाँच सूची', Headcount: 'गिनती', 'Physically present': 'वास्तव में उपस्थित', 'Register claims today': 'रजिस्टर में आज की संख्या',
  Remarks: 'टिप्पणी', 'Submit signed report': 'हस्ताक्षरित रिपोर्ट जमा करें',
  'No signal? The report is saved on the phone and sent automatically later.': 'सिग्नल नहीं? रिपोर्ट फ़ोन में सहेजी जाएगी और बाद में अपने-आप भेजी जाएगी।',
  'Signboard with scheme name displayed': 'योजना के नाम का साइनबोर्ड लगा है',
  'Beneficiary register maintained & signed': 'लाभार्थी रजिस्टर भरा और हस्ताक्षरित है',
  'Biometric / face attendance in use': 'बायोमेट्रिक / चेहरा उपस्थिति उपयोग में है',
  'Kitchen & toilets hygienic': 'रसोई और शौचालय साफ़ हैं',
  'Food served as per menu': 'मेन्यू के अनुसार भोजन दिया गया',
  'Staff present as per sanctioned posts': 'स्वीकृत पदों के अनुसार कर्मचारी मौजूद हैं',
  'Grievance box / helpline displayed': 'शिकायत पेटी / हेल्पलाइन प्रदर्शित है',
  'CCTV cameras functional': 'सीसीटीवी कैमरे चालू हैं',
  'Fire safety & first-aid available': 'अग्नि सुरक्षा और प्राथमिक चिकित्सा उपलब्ध है',
  'Fund utilisation records available': 'निधि उपयोग के रिकॉर्ड उपलब्ध हैं',

  // ---- inspector: reports / outbox
  'Discard queued report?': 'कतार में रखी रिपोर्ट हटाएँ?', 'The photos and data for {name} will be deleted from this phone.': '{name} की फ़ोटो और डेटा इस फ़ोन से हटा दिए जाएँगे।',
  Discard: 'हटाएँ', 'Waiting to upload': 'अपलोड की प्रतीक्षा', Rejected: 'अस्वीकृत', Queued: 'कतार में', 'Inspected {when}': 'निरीक्षण {when}',
  'Retry now': 'अभी दोबारा भेजें', Submitted: 'जमा की गई', 'No reports submitted yet.': 'अभी तक कोई रिपोर्ट जमा नहीं।', 'On-site': 'केंद्र पर',
  'Geo mismatch': 'स्थान मेल नहीं', 'synced later': 'बाद में भेजी गई',
  'Compliance {score}% · headcount {h}/{r} · {n} evidence file(s)': 'अनुपालन {score}% · गिनती {h}/{r} · {n} साक्ष्य फ़ाइलें',
  'Download PDF': 'PDF डाउनलोड करें', 'Offline reports uploaded': 'ऑफ़लाइन रिपोर्ट अपलोड हुईं', '{n} queued report(s) were submitted.': 'कतार की {n} रिपोर्ट जमा हो गईं।',

  // ---- NGO: attendance
  'Location permission is required': 'स्थान की अनुमति आवश्यक है', 'Face enrolled': 'चेहरा दर्ज हुआ', 'Attendance recorded': 'उपस्थिति दर्ज हुई',
  'Check-in rejected': 'उपस्थिति अस्वीकृत', 'Face score {score} · {m} m from site': 'चेहरा मिलान {score} · केंद्र से {m} मी', 'geofence {m} m': 'जियोफ़ेंस {m} मी',
  'Attendance counts only with a live face match inside the geofence. Proxy or remote check-ins are rejected and reported.':
    'उपस्थिति तभी मानी जाती है जब जियोफ़ेंस के अंदर लाइव चेहरा मेल खाए। प्रॉक्सी या दूर से की गई उपस्थिति अस्वीकार और रिपोर्ट की जाती है।',
  'Demo: simulate being on site': 'डेमो: केंद्र पर होने का अनुकरण', Present: 'उपस्थित', 'Not marked': 'दर्ज नहीं',
  'Re-enrol face': 'चेहरा फिर दर्ज करें', 'Enrol face': 'चेहरा दर्ज करें', 'Mark present': 'उपस्थित दर्ज करें', Enrol: 'दर्ज करें', Verify: 'सत्यापित करें',
  'One face, well lit, looking at the camera.': 'एक ही चेहरा, अच्छी रोशनी में, कैमरे की ओर देखते हुए।', Capture: 'फ़ोटो लें',
  incharge: 'प्रभारी', staff: 'कर्मचारी', beneficiary: 'लाभार्थी',
  'No face detected': 'कोई चेहरा नहीं मिला', 'Multiple faces in frame': 'फ़्रेम में एक से अधिक चेहरे',
  'Face does not match enrolled person': 'चेहरा दर्ज व्यक्ति से मेल नहीं खाता', 'Outside project geofence': 'परियोजना जियोफ़ेंस से बाहर',

  // ---- NGO: VC
  'Random video verification': 'औचक वीडियो सत्यापन',
  'DoSJE officials may call at any time without notice. Answer within 60 seconds and show the premises, register and beneficiaries live. Calls ring on this phone even when the app is closed.':
    'विभाग के अधिकारी बिना सूचना के कभी भी कॉल कर सकते हैं। 60 सेकंड में उत्तर दें और परिसर, रजिस्टर व लाभार्थियों को लाइव दिखाएँ। ऐप बंद होने पर भी कॉल की घंटी बजेगी।',
  'Call history': 'कॉल इतिहास', 'No calls yet.': 'अभी कोई कॉल नहीं।', open: 'खुली', 'called by {name}': '{name} द्वारा कॉल',
  'Incoming DoSJE verification call': 'विभाग की सत्यापन कॉल आ रही है', 'From {name}': '{name} की ओर से', 'Requested person': 'जिस व्यक्ति को बुलाया गया',
  'Answer now': 'अभी उत्तर दें', 'Leave call': 'कॉल छोड़ें',
  verified: 'सत्यापित', partial: 'आंशिक', suspicious: 'संदिग्ध', unanswered: 'उत्तर नहीं दिया',

  // ---- officials
  'Real-time monitoring': 'रीयल-टाइम निगरानी', 'AI models online': 'AI मॉडल चालू', 'AI service offline': 'AI सेवा बंद',
  'Projects monitored': 'निगरानी में परियोजनाएँ', 'High-risk projects': 'उच्च जोखिम परियोजनाएँ', 'CCTV cameras online': 'चालू सीसीटीवी कैमरे',
  'Open inspections': 'खुले निरीक्षण', 'Overdue inspections': 'विलंबित निरीक्षण', 'Open grievances': 'खुली शिकायतें', 'Live alerts': 'लाइव चेतावनियाँ',
  'Waiting for events… alerts from inspections, attendance, CCTV and grievances appear here instantly.': 'घटनाओं की प्रतीक्षा… निरीक्षण, उपस्थिति, सीसीटीवी और शिकायतों की चेतावनियाँ यहाँ तुरंत दिखेंगी।',
  '{name} submitted a report (score {score}%)': '{name} ने रिपोर्ट जमा की (स्कोर {score}%)',
  'Projects by AI risk': 'AI जोखिम के अनुसार परियोजनाएँ', 'ML offline': 'ML बंद', 'Risk {n}': 'जोखिम {n}',
  'Avg attendance {avg}/{cap}': 'औसत उपस्थिति {avg}/{cap}', '{n} flag(s)': '{n} चेतावनी',
  'AI risk': 'AI जोखिम', 'Sequence anomaly': 'क्रम विसंगति', '{d} days since inspection': 'पिछले निरीक्षण को {d} दिन',
  'Attendance – last 30 days': 'उपस्थिति – पिछले 30 दिन', 'sanctioned {n}': 'स्वीकृत {n}', 'No anomalies detected': 'कोई विसंगति नहीं मिली',
  'CCTV cameras': 'सीसीटीवी कैमरे', 'Last automatic check {when}: {n} people seen (expected ≈ {e})': 'अंतिम स्वचालित जाँच {when}: {n} लोग दिखे (अपेक्षित ≈ {e})',
  'Registered people': 'पंजीकृत लोग', 'Not enrolled': 'दर्ज नहीं',
  'CCTV surveillance': 'सीसीटीवी निगरानी', '{on} of {total} cameras online · each camera is health-checked every minute': '{total} में से {on} कैमरे चालू · हर कैमरे की हर मिनट जाँच होती है',
  'checked {when}': 'जाँच {when}', 'offline since {when}': '{when} से बंद', '{n} people seen': '{n} लोग दिखे',
  'Live WebRTC stream relayed by the media server. Snapshots and AI people-counting are available on the web dashboard; automatic occupancy checks run in the background.':
    'मीडिया सर्वर से लाइव WebRTC स्ट्रीम। स्नैपशॉट और AI गिनती वेब डैशबोर्ड पर उपलब्ध हैं; स्वचालित उपस्थिति जाँच पृष्ठभूमि में चलती है।',
  'Connecting…': 'जुड़ रहा है…', 'Reconnecting…': 'फिर से जुड़ रहा है…', 'Stream unavailable': 'स्ट्रीम उपलब्ध नहीं',
  'The server picks a project and a person at random. Their phone rings, even if the app is closed, and they have 60 seconds to answer.':
    'सर्वर यादृच्छिक रूप से परियोजना और व्यक्ति चुनता है। ऐप बंद होने पर भी उनके फ़ोन पर घंटी बजती है और उन्हें 60 सेकंड में उत्तर देना होता है।',
  'Limited to project {id}': 'केवल परियोजना {id}', 'Any project': 'कोई भी परियोजना', 'Start random VC': 'औचक वीडियो कॉल शुरू करें',
  'answered in {s}s': '{s} सेकंड में उत्तर', 'Not answered in time': 'समय पर उत्तर नहीं', 'Ringing on their phone…': 'उनके फ़ोन पर घंटी बज रही है…',
  'Answered in {s}s': '{s} सेकंड में उत्तर दिया', 'Close & record': 'बंद करें और दर्ज करें', 'Flag suspicious': 'संदिग्ध चिह्नित करें',
  'Face matches registered person': 'चेहरा पंजीकृत व्यक्ति से मेल खाता है', 'Premises / signboard shown live': 'परिसर / साइनबोर्ड लाइव दिखाया',
  'Beneficiaries physically present': 'लाभार्थी वास्तव में मौजूद', 'Attendance register shown on camera': 'उपस्थिति रजिस्टर कैमरे पर दिखाया',
  'Surprise inspections assigned': 'औचक निरीक्षण सौंपे गए', '{n} inspection(s) assigned · solver {status} · seed {seed}': '{n} निरीक्षण सौंपे गए · सॉल्वर {status} · सीड {seed}',
  'Random inspection assignment': 'यादृच्छिक निरीक्षण आवंटन',
  'Risk-weighted random selection with conflict-of-interest, rotation and capacity rules (OR-Tools).': 'जोखिम-आधारित यादृच्छिक चयन – हितों के टकराव, रोटेशन और क्षमता नियमों के साथ (OR-Tools)।',
  'Automatic: {n} inspection(s) every {days} at {time} IST': 'स्वचालित: हर {days} {time} बजे {n} निरीक्षण', weekday: 'कार्यदिवस', day: 'दिन',
  'Automatic assignment is switched off': 'स्वचालित आवंटन बंद है', 'Generate now': 'अभी बनाएँ', 'due {when}': 'अंतिम तिथि {when}', automatic: 'स्वचालित',
  assigned: 'सौंपा गया', 'in progress': 'जारी', completed: 'पूर्ण', overdue: 'समय-सीमा पार',

  // ---- grievances / feedback
  'Beneficiary grievances': 'लाभार्थी शिकायतें',
  'From beneficiaries in the app and anonymous QR codes at each centre. Serious grievances raise alerts and increase the project risk score.':
    'ऐप से लाभार्थियों और हर केंद्र के गुमनाम QR कोड से। गंभीर शिकायतें चेतावनी देती हैं और परियोजना का जोखिम स्कोर बढ़ाती हैं।',
  'All projects': 'सभी परियोजनाएँ', 'No grievances.': 'कोई शिकायत नहीं।', 'Anonymous (QR code)': 'गुमनाम (QR कोड)',
  '{name} (OTP-verified beneficiary)': '{name} (OTP-सत्यापित लाभार्थी)', 'Says not present today': 'आज उपस्थित नहीं होने की बात कही',
  'Services not received': 'सेवाएँ नहीं मिलीं', 'Action taken / reply to the beneficiary': 'की गई कार्रवाई / लाभार्थी को उत्तर',
  'In review': 'जाँच में', Resolve: 'निपटाएँ', Reject: 'अस्वीकार करें', Reply: 'उत्तर',
  'in review': 'जाँच में', resolved: 'निपटाई गई', rejected: 'अस्वीकृत',
  'Fake attendance / ghost beneficiaries': 'फ़र्ज़ी हाज़िरी / नकली लाभार्थी', 'Staff absent': 'कर्मचारी अनुपस्थित', 'Food / meals': 'भोजन',
  'Facilities (water, toilets, beds)': 'सुविधाएँ (पानी, शौचालय, बिस्तर)', 'Staff behaviour': 'कर्मचारियों का व्यवहार', 'Money demanded': 'पैसे माँगे गए',
  Other: 'अन्य', Appreciation: 'प्रशंसा',
  'Namaste, {name}': 'नमस्ते, {name}',
  'Your feedback goes directly to the Department of Social Justice & Empowerment, not to the centre.': 'आपकी राय सीधे सामाजिक न्याय एवं अधिकारिता विभाग तक जाती है, केंद्र तक नहीं।',
  'What is it about?': 'किस बारे में?', 'Were you at the centre today?': 'क्या आप आज केंद्र में उपस्थित थे?', 'Did you receive the services / meals?': 'क्या आपको सेवाएँ / भोजन मिला?',
  'Rate the centre': 'केंद्र को रेटिंग दें', 'Describe what happened': 'विवरण लिखें', 'My feedback': 'मेरी शिकायतें / राय', 'Nothing sent yet.': 'अभी कुछ नहीं भेजा।',
  'Department reply': 'विभाग का उत्तर', 'Thank you': 'धन्यवाद', 'Your feedback has been sent to the Department. You will see their reply here.': 'आपकी राय विभाग को भेज दी गई है। उनका उत्तर यहीं दिखेगा।',
};
