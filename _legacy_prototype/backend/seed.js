// Synthetic seed data. In production this is replaced by the scheme MIS / PFMS sync.
function buildSeed() {
  // Deterministic PRNG so the demo data is the same on every load.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(26095);

  const projects = [
    { id: 'P101', name: 'Integrated Rehab Centre for Addicts', scheme: 'NAPDDR', ngo: 'Navjeevan Seva Samiti', district: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462, sanctioned: 30, incharge: 'Dr. R. K. Verma' },
    { id: 'P102', name: 'Senior Citizens Home', scheme: 'AVYAY', ngo: 'Aashray Foundation', district: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376, sanctioned: 50, incharge: 'Smt. Anita Kumari' },
    { id: 'P103', name: 'SMILE Shelter Home', scheme: 'SMILE', ngo: 'Garima Trust', district: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, sanctioned: 40, incharge: 'Sh. Mohan Patel' },
    { id: 'P104', name: 'PM-DAKSH Skill Training Centre', scheme: 'PM-DAKSH', ngo: 'Kaushal Vikas Sansthan', district: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, sanctioned: 60, incharge: 'Sh. Vikram Singh' },
    { id: 'P105', name: 'SHREYAS Residential Hostel', scheme: 'SHRESHTA', ngo: 'Vidya Jyoti Society', district: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882, sanctioned: 100, incharge: 'Smt. Leena Wankhede' },
    { id: 'P106', name: 'Garima Greh (Transgender Shelter)', scheme: 'SMILE', ngo: 'Samanvay Collective', district: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, sanctioned: 25, incharge: 'Ms. Ranjita Das' },
    { id: 'P107', name: 'Senior Citizens Day Care', scheme: 'AVYAY', ngo: 'Sahara Welfare Org', district: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, sanctioned: 45, incharge: 'Sh. Prakash Rao' },
    { id: 'P108', name: 'Outreach & Drop-in Centre', scheme: 'NAPDDR', ngo: 'Nai Disha Foundation', district: 'Amritsar', state: 'Punjab', lat: 31.634, lng: 74.8723, sanctioned: 35, incharge: 'Sh. Gurpreet Sandhu' },
  ];

  // Anomaly profile injected into the synthetic attendance so the analytics has something to find.
  const profile = { P103: 'flat', P106: 'spike', P108: 'overreport' };

  projects.forEach(p => {
    const base = Math.round(p.sanctioned * (0.7 + rnd() * 0.2));
    p.attendance = [];
    for (let d = 29; d >= 0; d--) {
      let v = Math.round(base + (rnd() - 0.5) * p.sanctioned * 0.15);
      if (profile[p.id] === 'flat') v = p.sanctioned;                      // identical full count every day -> proxy register
      if (profile[p.id] === 'spike' && (d === 3 || d === 17)) v = p.sanctioned; // jumps only on inspection days
      if (profile[p.id] === 'spike' && d !== 3 && d !== 17) v = Math.round(base * 0.45);
      if (profile[p.id] === 'overreport' && d < 10) v = p.sanctioned + 6;  // more than sanctioned capacity
      p.attendance.push(Math.max(0, v));
    }
    p.inspectionDays = profile[p.id] === 'spike' ? [3, 17] : [Math.floor(rnd() * 30)];
    p.lastInspectedDaysAgo = Math.floor(rnd() * 120);
    p.complaints = Math.floor(rnd() * 4) + (profile[p.id] ? 2 : 0);
    p.fundUtilisation = Math.round(55 + rnd() * 45);
    p.cameras = ['Main Gate', 'Dormitory', 'Kitchen', 'Activity Hall'].map((c, i) => ({
      id: `${p.id}-C${i + 1}`, label: c, online: !(profile[p.id] === 'flat' && i > 1) && rnd() > 0.08,
    }));
    p.staff = [
      { name: p.incharge, role: 'Project Incharge', phone: '+91 98' + String(Math.floor(rnd() * 1e8)).padStart(8, '0') },
      { name: ['Sunita', 'Rakesh', 'Imran', 'Kavya'][Math.floor(rnd() * 4)] + ' (Counsellor)', role: 'Staff' },
      { name: ['Ramesh', 'Lata', 'Joseph', 'Meena'][Math.floor(rnd() * 4)] + ' (Beneficiary)', role: 'Beneficiary' },
    ];
  });

  const inspectors = [
    { id: 'I01', name: 'Arjun Mehta', team: 'PMU Delhi', homeState: 'Uttar Pradesh', lat: 28.6139, lng: 77.209, load: 2 },
    { id: 'I02', name: 'Priya Nair', team: 'PMU South', homeState: 'Karnataka', lat: 12.9716, lng: 77.5946, load: 1 },
    { id: 'I03', name: 'Sanjay Ghosh', team: 'PMU East', homeState: 'West Bengal', lat: 22.5726, lng: 88.3639, load: 3 },
    { id: 'I04', name: 'Neha Joshi', team: 'PMU West', homeState: 'Maharashtra', lat: 19.076, lng: 72.8777, load: 0 },
    { id: 'I05', name: 'Farhan Qureshi', team: 'PMU Central', homeState: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, load: 1 },
    { id: 'I06', name: 'Harpreet Kaur', team: 'PMU North', homeState: 'Punjab', lat: 30.7333, lng: 76.7794, load: 2 },
  ];

  return { projects, inspectors };
}
module.exports = { buildSeed };
