export type PropertyIntelligence = {
  photo: string | null;
  zestimate: number | null;
  livingArea: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  latitude: number | null;
  longitude: number | null;
  mapImage: string | null;
};

export type PropertyIntelligenceResponse = {
  property: PropertyIntelligence | null;
};
