// ===================================================================
// DELTA PROTOCOL — Lightweight field verification synchronization (.pcrpd)
// Enables PEAs to submit ~15KB delta packets and RPMO to merge multiple LGUs.
// ===================================================================

var PCRP_DELTA = (function () {
  var DELTA_FORMAT = 'PCRP_DELTA_V1';

  // Export current municipal verification records as a .pcrpd packet
  function createDeltaPacket(options) {
    // options: { authorName, role, province, municipality, pullDate, verifyRecords }
    var records = options.verifyRecords || {};
    var count = Object.keys(records).length;
    var countsByStatus = { match: 0, differ: 0, missing: 0 };

    for (var id in records) {
      var st = records[id].status;
      if (countsByStatus[st] !== undefined) countsByStatus[st]++;
    }

    var packet = {
      format: DELTA_FORMAT,
      version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '2.12.0',
      createdAt: new Date().toISOString(),
      author: {
        name: options.authorName || 'Field Evaluator',
        role: options.role || (typeof userRole === 'function' ? userRole() : 'pea_mdm'),
        province: options.province || '',
        municipality: options.municipality || ''
      },
      pullDate: options.pullDate || '',
      stats: {
        totalTags: count,
        match: countsByStatus.match,
        differ: countsByStatus.differ,
        notOnSheet: countsByStatus.missing
      },
      records: records
    };

    return packet;
  }

  // Download delta packet to user's computer
  function downloadDelta(packet) {
    var jsonStr = JSON.stringify(packet, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    var muniTag = (packet.author.municipality || 'Scope').replace(/\s+/g, '_');
    var dateTag = (packet.createdAt || '').slice(0, 10);
    var filename = 'PCRP_Verification_Delta_' + muniTag + '_' + dateTag + '.pcrpd';
    saveBlob(blob, filename);
  }

  // Parse and validate an incoming .pcrpd file content
  function parseDelta(rawText) {
    var data = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
    if (!data || data.format !== DELTA_FORMAT) {
      throw new Error('Invalid verification delta packet: unknown format.');
    }
    if (!data.records || typeof data.records !== 'object') {
      throw new Error('Invalid verification delta: missing records payload.');
    }
    return data;
  }

  // Merge incoming delta packet into existing verify tags with conflict resolution
  function mergeDelta(existingRecords, incomingDelta, options) {
    // options: { strategy: 'newer' | 'incoming' | 'existing' }
    var strategy = (options && options.strategy) || 'newer';
    var incomingRecords = incomingDelta.records || {};
    var merged = Object.assign({}, existingRecords);
    var stats = { added: 0, updated: 0, unchanged: 0 };

    for (var id in incomingRecords) {
      var inc = incomingRecords[id];
      var exist = merged[id];

      if (!exist) {
        merged[id] = inc;
        stats.added++;
      } else {
        if (strategy === 'incoming') {
          merged[id] = inc;
          stats.updated++;
        } else if (strategy === 'existing') {
          stats.unchanged++;
        } else {
          // 'newer' strategy: compare timestamps
          var tInc = inc.timestamp ? new Date(inc.timestamp).getTime() : 0;
          var tExist = exist.timestamp ? new Date(exist.timestamp).getTime() : 0;
          if (tInc >= tExist) {
            merged[id] = inc;
            stats.updated++;
          } else {
            stats.unchanged++;
          }
        }
      }
    }

    return {
      mergedRecords: merged,
      stats: stats
    };
  }

  return {
    createDeltaPacket: createDeltaPacket,
    downloadDelta: downloadDelta,
    parseDelta: parseDelta,
    mergeDelta: mergeDelta
  };
})();
