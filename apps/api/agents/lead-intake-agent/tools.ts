import { tool } from '@langchain/core/tools';

function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(email);
}

function normalizePhone(input: string): string {
  const digits = String(input || '').replace(/\D+/g, '');
  return digits;
}

function isValidPhone(phone: string): boolean {
  const d = normalizePhone(phone);
  return d.length >= 10 && d.length <= 15;
}

const createContact = tool(
  async (input: any) => {
    const firstName = String(input?.firstName || '').trim();
    const lastName = String(input?.lastName || '').trim();
    const email = String(input?.email || '').trim();
    const phone = String(input?.phone || '').trim();

    if (!firstName || !lastName || !email || !phone) {
      return { ok: false, error: 'missing_fields' };
    }
    if (!isValidEmail(email)) {
      return { ok: false, error: 'invalid_email' };
    }
    if (!isValidPhone(phone)) {
      return { ok: false, error: 'invalid_phone' };
    }

    const id = 'contact_' + Math.random().toString(36).slice(2, 10);
    return { ok: true, id, message: `Created contact for ${firstName} ${lastName}` };
  },
  {
    name: 'create_contact',
    description: 'Create a contact once firstName, lastName, email, and phone are all present and valid.',
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['firstName', 'lastName', 'email', 'phone'],
      additionalProperties: false,
    },
  }
);

const endConversation = tool(
  async (input: any) => {
    const reason = String(input?.reason || 'user requested to end');
    return { ok: true, reason };
  },
  {
    name: 'end_conversation',
    description: 'Signal that the conversation should end now.',
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
  }
);

export default [createContact, endConversation];
