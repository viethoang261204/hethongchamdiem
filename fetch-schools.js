const fs = require('fs');
const path = require('path');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const VIETNAM_AREAS = [
  { name: 'Hà Nội', key: 'Hà Nội' },
  { name: 'TP. Hồ Chí Minh', key: 'Hồ Chí Minh' },
  { name: 'Đà Nẵng', key: 'Đà Nẵng' },
  { name: 'Hải Phòng', key: 'Hải Phòng' },
  { name: 'Cần Thơ', key: 'Cần Thơ' },
  { name: 'An Giang', key: 'An Giang' },
  { name: 'Bà Rịa - Vũng Tàu', key: 'Bà Rịa - Vũng Tàu' },
  { name: 'Bắc Giang', key: 'Bắc Giang' },
  { name: 'Bắc Kạn', key: 'Bắc Kạn' },
  { name: 'Bạc Liêu', key: 'Bạc Liêu' },
  { name: 'Bắc Ninh', key: 'Bắc Ninh' },
  { name: 'Bến Tre', key: 'Bến Tre' },
  { name: 'Bình Định', key: 'Bình Định' },
  { name: 'Bình Dương', key: 'Bình Dương' },
  { name: 'Bình Phước', key: 'Bình Phước' },
  { name: 'Bình Thuận', key: 'Bình Thuận' },
  { name: 'Cà Mau', key: 'Cà Mau' },
  { name: 'Cao Bằng', key: 'Cao Bằng' },
  { name: 'Đắk Lắk', key: 'Đắk Lắk' },
  { name: 'Đắk Nông', key: 'Đắk Nông' },
  { name: 'Điện Biên', key: 'Điện Biên' },
  { name: 'Đồng Nai', key: 'Đồng Nai' },
  { name: 'Đồng Tháp', key: 'Đồng Tháp' },
  { name: 'Gia Lai', key: 'Gia Lai' },
  { name: 'Hà Giang', key: 'Hà Giang' },
  { name: 'Hà Nam', key: 'Hà Nam' },
  { name: 'Hà Tĩnh', key: 'Hà Tĩnh' },
  { name: 'Hải Dương', key: 'Hải Dương' },
  { name: 'Hậu Giang', key: 'Hậu Giang' },
  { name: 'Hòa Bình', key: 'Hòa Bình' },
  { name: 'Hưng Yên', key: 'Hưng Yên' },
  { name: 'Khánh Hòa', key: 'Khánh Hòa' },
  { name: 'Kiên Giang', key: 'Kiên Giang' },
  { name: 'Kon Tum', key: 'Kon Tum' },
  { name: 'Lai Châu', key: 'Lai Châu' },
  { name: 'Lâm Đồng', key: 'Lâm Đồng' },
  { name: 'Lạng Sơn', key: 'Lạng Sơn' },
  { name: 'Lào Cai', key: 'Lào Cai' },
  { name: 'Long An', key: 'Long An' },
  { name: 'Nam Định', key: 'Nam Định' },
  { name: 'Nghệ An', key: 'Nghệ An' },
  { name: 'Ninh Bình', key: 'Ninh Bình' },
  { name: 'Ninh Thuận', key: 'Ninh Thuận' },
  { name: 'Phú Thọ', key: 'Phú Thọ' },
  { name: 'Quảng Bình', key: 'Quảng Bình' },
  { name: 'Quảng Nam', key: 'Quảng Nam' },
  { name: 'Quảng Ngãi', key: 'Quảng Ngãi' },
  { name: 'Quảng Ninh', key: 'Quảng Ninh' },
  { name: 'Quảng Trị', key: 'Quảng Trị' },
  { name: 'Sóc Trăng', key: 'Sóc Trăng' },
  { name: 'Sơn La', key: 'Sơn La' },
  { name: 'Tây Ninh', key: 'Tây Ninh' },
  { name: 'Thái Bình', key: 'Thái Bình' },
  { name: 'Thái Nguyên', key: 'Thái Nguyên' },
  { name: 'Thanh Hóa', key: 'Thanh Hóa' },
  { name: 'Thừa Thiên Huế', key: 'Thừa Thiên Huế' },
  { name: 'Tiền Giang', key: 'Tiền Giang' },
  { name: 'Trà Vinh', key: 'Trà Vinh' },
  { name: 'Tuyên Quang', key: 'Tuyên Quang' },
  { name: 'Vĩnh Long', key: 'Vĩnh Long' },
  { name: 'Vĩnh Phúc', key: 'Vĩnh Phúc' },
  { name: 'Yên Bái', key: 'Yên Bái' }
];

function buildOverpassQuery(areaName) {
  return `[out:json];
area["name"="${areaName}"]->.searchArea;
(
  node["amenity"="school"](area.searchArea);
  way["amenity"="school"](area.searchArea);
  relation["amenity"="school"](area.searchArea);
);
out center;`;
}

function extractSchoolData(element) {
  const tags = element.tags || {};
  const name = tags.name || tags['name:vi'] || tags['name:en'] || 'Không tên';
  
  let location = null;
  let address = null;
  
  if (element.type === 'node') {
    location = { lat: element.lat, lon: element.lon };
  } else if (element.type === 'way' || element.type === 'relation') {
    if (element.center) {
      location = { lat: element.center.lat, lon: element.center.lon };
    }
  }
  
  if (tags['addr:street'] || tags['addr:housenumber'] || tags['addr:city'] || tags['addr:district']) {
    address = {
      street: tags['addr:street'] || null,
      housenumber: tags['addr:housenumber'] || null,
      city: tags['addr:city'] || tags['addr:town'] || null,
      district: tags['addr:district'] || null,
      ward: tags['addr:ward'] || null
    };
  }
  
  let schoolType = 'school';
  if (tags['school:primary']) schoolType = 'primary';
  else if (tags['school:secondary']) schoolType = 'secondary';
  else if (tags['school:high']) schoolType = 'high';
  else if (tags.school === 'primary') schoolType = 'primary';
  else if (tags.school === 'secondary') schoolType = 'secondary';
  else if (tags.school === 'high_school') schoolType = 'high';
  else if (tags.school === 'elementary') schoolType = 'primary';
  else if (tags.school === 'middle') schoolType = 'secondary';
  
  let students = null;
  if (tags['school:students']) {
    students = parseInt(tags['school:students'], 10) || null;
  }
  
  return {
    id: element.id,
    name: name,
    type: schoolType,
    location: location,
    address: address,
    students: students,
    rawTags: tags
  };
}

async function fetchSchoolsForArea(areaName) {
  const query = buildOverpassQuery(areaName);
  console.log(`Fetching schools for: ${areaName}...`);
  
  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'data=' + encodeURIComponent(query)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.elements || data.elements.length === 0) {
      console.log(`  No schools found for ${areaName}`);
      return [];
    }
    
    const schools = data.elements.map(el => {
      const school = extractSchoolData(el);
      school.province = areaName;
      return school;
    });
    
    console.log(`  Found ${schools.length} schools in ${areaName}`);
    return schools;
    
  } catch (error) {
    console.error(`  Error fetching ${areaName}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('Starting to fetch schools from OpenStreetMap (Overpass API)...\n');
  
  const allSchools = [];
  
  for (const area of VIETNAM_AREAS) {
    const schools = await fetchSchoolsForArea(area.name);
    allSchools.push(...schools);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const output = {
    schools: allSchools,
    total: allSchools.length,
    fetchedAt: new Date().toISOString()
  };
  
  const outputPath = path.join(__dirname, 'data', 'schools.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n✓ Done! Total schools fetched: ${allSchools.length}`);
  console.log(`✓ Saved to: ${outputPath}`);
  
  const typeCount = {};
  allSchools.forEach(s => {
    typeCount[s.type] = (typeCount[s.type] || 0) + 1;
  });
  console.log('\nSchool types breakdown:');
  Object.entries(typeCount).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}

main().catch(console.error);
