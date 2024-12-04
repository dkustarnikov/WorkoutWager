export interface CreateAccountRequest {
  contact: Contact;
  identity: Identity;
  disclosures: Disclosures;
  agreements: Agreement[];
  documents: Document[];
  trustedContact?: TrustedContact;
  marketingPreferences?: MarketingPreferences;
  disclosuresOther?: DisclosuresOther;
}

export interface Contact {
  emailAddress: string;
  phoneNumber: string;
  streetAddress: Address[];
}

export interface Identity {
  givenName: string;
  middleName?: string;
  familyName: string;
  dateOfBirth: string; // ISO 8601 date string
  taxId: string;
  taxIdType: 'USA_SSN' | 'USA_TIN' | 'OTHER';
  countryOfCitizenship: string[];
  countryOfBirth: string;
  countryOfTaxResidence: string[];
  visaType?: string;
  visaExpirationDate?: string; // ISO 8601 date string
  dateOfFirstTrade?: string; // ISO 8601 date string
}

export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Disclosures {
  isControlPerson: boolean;
  isAffiliatedExchangeOrFINRA: boolean;
  isPoliticallyExposed: boolean;
  immediateFamilyExposed: boolean;
}

export interface Agreement {
  agreement: string;
  signedAt: string; // ISO 8601 date string
  ipAddress: string;
  revision: string;
}

export interface Document {
  documentType: string;
  content: string; // Base64 encoded
  mimeType: string;
}

export interface TrustedContact {
  givenName: string;
  familyName: string;
  emailAddress?: string;
  phoneNumber?: string;
}

export interface MarketingPreferences {
  isConsentGranted: boolean;
}

export interface DisclosuresOther {
  controlPersonCompanySymbols?: string[];
  politicallyExposedDetails?: string;
  immediateFamilyExposedDetails?: string;
}
