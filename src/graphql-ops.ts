// Tock GraphQL operation documents, captured verbatim from the exploretock.com
// web app (see docs/TOCK-API.md). Endpoint: POST /api/graphql/<op>?opname=<op>.
//
// Only the authenticated *reads* live here. Tock's booking/cancel *transaction*
// does NOT use GraphQL — it goes through the protobuf /api/consumer/* endpoints
// (opaque binary), so this MCP does not implement writes.

/** `selection` enum accepted by the `purchases` query. */
export type ReservationSelection = 'UPCOMING' | 'PAST' | 'CANCELED';

/**
 * PatronReservationHistory — the signed-in patron's reservations/purchases.
 * Verified live: `POST /api/graphql/PatronReservationHistory` returns
 * `{ data: { purchases: [...] } }`. Query text (operation + fragment) is exactly
 * what the web app sends.
 */
export const PATRON_RESERVATION_HISTORY = `
    query PatronReservationHistory($offset: Int!, $limit: Int!, $selection: String!) {
  purchases(offset: $offset, limit: $limit, selection: $selection) {
    id
    ...ConsumerPurchaseSummary
  }
}

    fragment ConsumerPurchaseSummary on ConsumerPurchaseSummary {
  business {
    domainName
    id
    profileImages {
      altText
      backingUrl
      dominantColor
      id
      imageUrl
    }
    name
  }
  cancelledOrRefunded
  city
  country
  dinerPatron {
    email
    firstName
    lastName
    id
  }
  eligibleForFeedback
  visitFiveStarRating
  firstTransferredTo {
    id
  }
  id
  ownerPatron {
    email
    firstName
    lastName
    id
  }
  ticketCount
  ticketDateTime
  ticketType {
    deliveryServiceProvider
    descriptiveVariety
    id
    name
    reserveShippingTime
    singleUnitQuantity
    variety
  }
}
`;
