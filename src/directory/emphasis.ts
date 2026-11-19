// Categories shown in bold wherever members, admins and managers pick or browse a category.
export const boldGroups = ['Dating', 'Adult'];
export const boldServices = ['women-seeking-men', 'bodyrubs', 'female-escorts'];
export const isBoldGroup = (name: string) => boldGroups.includes(name);
export const isBoldService = (slug: string) => boldServices.includes(slug);
