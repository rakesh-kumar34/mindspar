// Country list for the signup picker and the "name · country" shown when
// players meet. Codes are ISO 3166-1 alpha-2; the flag is derived from the code
// as Unicode regional-indicator letters, so no image assets are needed.
export const flagOf = cc =>
  cc && cc.length === 2
    ? cc.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)))
    : "";

export const COUNTRIES = [
  ["AR", "Argentina"], ["AU", "Australia"], ["AT", "Austria"], ["BD", "Bangladesh"],
  ["BE", "Belgium"], ["BR", "Brazil"], ["BG", "Bulgaria"], ["CA", "Canada"],
  ["CL", "Chile"], ["CN", "China"], ["CO", "Colombia"], ["HR", "Croatia"],
  ["CZ", "Czechia"], ["DK", "Denmark"], ["EG", "Egypt"], ["FI", "Finland"],
  ["FR", "France"], ["DE", "Germany"], ["GR", "Greece"], ["HK", "Hong Kong"],
  ["HU", "Hungary"], ["IS", "Iceland"], ["IN", "India"], ["ID", "Indonesia"],
  ["IE", "Ireland"], ["IL", "Israel"], ["IT", "Italy"], ["JP", "Japan"],
  ["KE", "Kenya"], ["MY", "Malaysia"], ["MX", "Mexico"], ["NL", "Netherlands"],
  ["NZ", "New Zealand"], ["NG", "Nigeria"], ["NO", "Norway"], ["PK", "Pakistan"],
  ["PE", "Peru"], ["PH", "Philippines"], ["PL", "Poland"], ["PT", "Portugal"],
  ["RO", "Romania"], ["RU", "Russia"], ["SA", "Saudi Arabia"], ["RS", "Serbia"],
  ["SG", "Singapore"], ["SK", "Slovakia"], ["ZA", "South Africa"], ["KR", "South Korea"],
  ["ES", "Spain"], ["LK", "Sri Lanka"], ["SE", "Sweden"], ["CH", "Switzerland"],
  ["TW", "Taiwan"], ["TH", "Thailand"], ["TR", "Türkiye"], ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"], ["GB", "United Kingdom"], ["US", "United States"],
  ["VN", "Vietnam"],
];

export const countryName = code => (COUNTRIES.find(c => c[0] === code) || [, ""])[1];
