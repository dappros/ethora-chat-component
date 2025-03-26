import { RoomMember, ApiRoom } from '../types/types';

interface MemberExtractionResult {
  array: RoomMember[];
  object: Record<string, RoomMember>;
  map: Map<string, RoomMember>;
  set: Set<string>;
}

export function extractUniqueMembersFromRooms(
  rooms: ApiRoom[]
): MemberExtractionResult {
  const uniqueMembersMap = new Map<string, RoomMember>();

  rooms.forEach((room) => {
    if (room.members) {
      room.members.forEach((member) => {
        if (member.xmppUsername) {
          uniqueMembersMap.set(member.xmppUsername, member);
        }
      });
    }
  });

  const uniqueMembersArray = Array.from(uniqueMembersMap.values());

  const uniqueMembersObject = uniqueMembersArray.reduce(
    (acc, member) => {
      if (member.xmppUsername) {
        acc[member.xmppUsername] = member;
      }
      return acc;
    },
    {} as Record<string, RoomMember>
  );

  const uniqueMembersSet = new Set(uniqueMembersMap.keys());

  return {
    array: uniqueMembersArray,
    object: uniqueMembersObject,
    map: uniqueMembersMap,
    set: uniqueMembersSet,
  };
}
