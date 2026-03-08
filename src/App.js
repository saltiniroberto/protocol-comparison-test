import { useState, useMemo, useRef, useCallback, useEffect } from "react";

// Renders a description string with [text](url) markdown links as inline <a> elements.
function parseDesc(text) {
  if (!text) return null;
  const parts = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color:"#38BDF8", textDecoration:"underline",
          textDecorationColor:"rgba(56,189,248,0.4)",
          textUnderlineOffset:"2px",
          cursor:"pointer",
        }}
        onMouseEnter={e => e.currentTarget.style.textDecorationColor="#38BDF8"}
        onMouseLeave={e => e.currentTarget.style.textDecorationColor="rgba(56,189,248,0.4)"}
      >{m[1]}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}




const PROPERTY_META = {
  "Safety": {
    type:"bool", rank:"true-better",
    desc: "A protocol is safe if it never returns different values to different nodes for the same consensus instance — i.e. once a value is decided, no other value can ever be decided. Safety is a non-negotiable baseline: a protocol that violates it can produce inconsistent state across the system, which is typically catastrophic. All practical consensus protocols guarantee safety under any number of failures, as long as a quorum is reachable. See [Lamport's paper on safety & liveness](https://lamport.azurewebsites.net/pubs/safety-liveness.pdf) for the formal treatment.",
  },
  "Liveness (async network)": {
    type:"bool", rank:"true-better",
    desc: "Liveness means the protocol will eventually make progress and reach a decision. The [FLP impossibility result](https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf) (Fischer, Lynch, Paterson, 1985) proves that no deterministic consensus protocol can guarantee both safety and liveness in a fully asynchronous network where even one node may crash. In practice, protocols achieve liveness by assuming partial synchrony (eventual message delivery bounds) or by using randomisation. Without liveness, the system may stall indefinitely under adverse network conditions.",
  },
  "Byzantine fault tolerance": {
    type:"bool", rank:"true-better",
    desc: "A Byzantine fault occurs when a node behaves arbitrarily — sending conflicting messages, lying about its state, or colluding with other faulty nodes. Byzantine fault-tolerant (BFT) protocols remain safe even when up to f nodes behave maliciously, as long as the total number of nodes n ≥ 3f+1. Non-BFT protocols only handle crash faults (nodes that stop responding), which is a much weaker adversary. BFT is essential in open or adversarial settings such as blockchains, but adds significant complexity and communication overhead. The concept originates in the [Byzantine Generals problem](https://lamport.azurewebsites.net/pubs/byz.pdf) by Lamport, Shostak, and Pease.",
  },
  "Optimistic fast path": {
    type:"bool", rank:"true-better",
    desc: "Some protocols have a fast path that reduces the number of communication rounds when conditions are favourable — typically when the network is synchronous and no failures occur. For example, a protocol with a normal-case latency of 3 rounds might commit in 2 rounds on the fast path. This is particularly valuable in high-throughput systems where the common case dominates performance. The tradeoff is added protocol complexity to handle the fallback when the fast path cannot be used.",
  },
  "Leader-based": {
    type:"bool", rank:"none",
    desc: "In a leader-based protocol, one designated node (the leader or primary) coordinates each round of consensus. All client requests go through the leader, which proposes values and drives the protocol forward. This simplifies the protocol and reduces message complexity, but creates a single point of bottleneck and failure. When the leader crashes or becomes slow, the system must elect a new one, which typically causes a temporary unavailability window.",
  },
  "Leaderless": {
    type:"bool", rank:"none",
    desc: "Leaderless protocols allow any node to initiate a consensus instance without going through a central coordinator. This eliminates the leader bottleneck and can reduce latency by allowing clients to contact the nearest node. However, leaderless protocols must handle conflicts when multiple nodes propose different values concurrently, typically requiring additional coordination such as dependency tracking (as in EPaxos). They are generally harder to implement correctly than leader-based protocols.",
  },
  "Reconfiguration support": {
    type:"bool", rank:"true-better",
    desc: "Reconfiguration is the ability to change the set of nodes participating in the consensus protocol (adding or removing nodes) while the system continues to operate. This is essential for long-running systems where hardware is replaced, nodes are decommissioned, or capacity needs to change. Reconfiguration is surprisingly hard to get right: naive approaches can violate safety by creating overlapping quorums across old and new configurations. Protocols like Raft include reconfiguration as a first-class feature via joint consensus, while others (like classic Paxos) leave it underspecified.",
  },
  "Multi-value consensus": {
    type:"bool", rank:"true-better",
    desc: "Basic consensus (sometimes called single-decree consensus) agrees on a single value once. Multi-value consensus — also called state machine replication — extends this to agree on an ordered sequence of commands, allowing a replicated state machine to process an unbounded log of operations. This is what practical systems like databases and coordination services actually need. Protocols like Raft and ZAB are designed specifically for multi-value consensus, while classic Paxos requires non-trivial extensions (Multi-Paxos) to support it.",
  },
  "Pipeline support": {
    type:"bool", rank:"true-better",
    desc: "A pipelined protocol can have multiple consensus instances in flight simultaneously, without waiting for each one to fully commit before starting the next. This dramatically increases throughput, as the network is kept busy even when individual rounds have non-trivial latency. Without pipelining, the system is limited to one round-trip per committed entry, which is often the bottleneck. HotStuff achieves pipelining by chaining rounds together; Raft supports it via its log replication mechanism.",
  },
  "Rotating leader": {
    type:"bool", rank:"true-better",
    desc: "In protocols with a rotating (or round-robin) leader, a different node leads each consensus round or epoch rather than one fixed node serving indefinitely. This distributes the load more evenly across nodes and can improve fairness. It also makes the system more resilient to a slow or overloaded leader, as the rotation naturally replaces it. HotStuff and Tendermint use rotating leaders; Raft and classic Paxos use a stable leader until it fails.",
  },
  "Formal verification": {
    type:"bool", rank:"true-better",

    desc: "Formal verification means the protocol's correctness properties (safety, liveness, etc.) have been proved using a machine-checked proof assistant such as TLA+, Coq, or Isabelle. This provides much stronger guarantees than informal arguments or testing, which cannot exhaustively cover all possible interleavings and failure scenarios. Paxos was specified in TLA+ by Lamport ([Paxos TLA+ spec](https://github.com/tlaplus/Examples/tree/master/specifications/Paxos)); Raft has been verified in multiple tools ([Raft TLA+ spec](https://github.com/ongardie/raft.tla)). Formal verification is especially important for consensus protocols, where subtle bugs can lead to data loss or corruption.",
  },
  "Communication rounds (normal)": {
    type:"number", rank:"lower",
    desc: "The number of sequential message-exchange rounds required to reach a decision in the normal (failure-free, synchronous) case. Each round typically involves a broadcast from the leader followed by replies from a quorum. Fewer rounds means lower commit latency. Most crash-fault-tolerant protocols require 2 rounds (propose + accept); BFT protocols generally require 3 rounds because an extra phase is needed to prevent Byzantine nodes from equivocating. This is a fundamental lower bound: 1 round is sufficient only under very strong synchrony assumptions.",
  },
  "Failure rounds": {
    type:"number", rank:"lower",
    desc: "The number of sequential communication rounds required to reach a decision when a failure (crash or Byzantine) occurs. This is typically higher than the normal-case round count because the protocol must detect the failure, replace the leader (view change), and restart or recover the in-flight consensus instance. For BFT protocols, the view-change protocol itself is often as complex as the normal-case protocol. A null value here means the protocol does not have a separate failure-path round count (e.g. crash-fault-tolerant protocols with timeouts).",
  },
  "Message complexity (normal)": {
    type:"string", rank:"order", order:["O(n²)","O(n log n)","O(n)"],
    desc: "The total number of messages exchanged per consensus round in the normal case, as a function of the number of nodes n. O(n) means the leader sends to all nodes and collects replies — linear in n. O(n²) means all-to-all communication, where every node must hear from every other node. This is the case in classic PBFT and Tendermint, where nodes broadcast their votes to all peers. O(n²) becomes a severe bottleneck at scale (e.g. 100 nodes → 10,000 messages per round). HotStuff's key contribution was reducing BFT message complexity to O(n) via threshold signatures.",
  },
  "Max. faulty nodes (of n)": {
    type:"string", rank:"order", order:["⌊(n−1)/4⌋","⌊(n−1)/3⌋","⌊(n−1)/2⌋"],
    desc: "The maximum number of faulty nodes f the protocol can tolerate while still guaranteeing safety and liveness, expressed as a fraction of the total node count n. Crash-fault-tolerant protocols can tolerate up to f = ⌊(n−1)/2⌋ failures (a minority), since a majority quorum is sufficient for agreement. BFT protocols are limited to f = ⌊(n−1)/3⌋ because Byzantine nodes can actively lie, and the protocol needs enough honest nodes to outvote them in any quorum intersection. Higher fault tolerance means the system remains available under more failures, but typically requires more nodes for the same fault tolerance threshold.",
  },
  "Fault model": {
    type:"string", rank:"order", order:["Crash","Byzantine"],
    desc: "The fault model defines what kinds of node failures the protocol is designed to handle. A Crash fault model assumes that faulty nodes simply stop responding — they do not send incorrect or conflicting messages. This is a realistic model for data centre deployments with trusted hardware. A Byzantine fault model (also called arbitrary faults) assumes faulty nodes can behave in any way: sending conflicting messages to different peers, selectively dropping messages, or actively trying to subvert the protocol. Byzantine tolerance is essential when nodes are operated by different untrusted parties, as in decentralised blockchains. Byzantine protocols are strictly more general but significantly more expensive.",
  },
};

// ─── Open problem metadata ───────────────────────────────────────────────────
// Each entry has a global desc (shown in tooltip header) and a difficulty scale.
// Per-protocol entries in PROTOCOLS.openProblems have shape:
//   { difficulty: 1|2|3, desc: "protocol-specific note (optional)" }
// difficulty: 1 = minor, 2 = moderate, 3 = severe
const DIFFICULTY_LABEL = { 1:"minor", 2:"moderate", 3:"severe" };
const DIFFICULTY_COLOR = { 1:"#FBBF24", 2:"#F97316", 3:"#F87171" };

// Global problem descriptions: explains *what* the problem is in protocol-agnostic terms.
// No protocol names or protocol-specific detail should appear here.
const OPEN_PROBLEM_META = {
  "Liveness under asynchrony (FLP)": {
    desc: "The [FLP impossibility result](https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf) (Fischer, Lynch, Paterson 1985) proves that no deterministic protocol can guarantee termination in a purely asynchronous network where even one process may crash. It is a fundamental theoretical limit, not a bug — every practical protocol circumvents it by assuming partial synchrony or using randomisation.",
  },
  "Leader bottleneck": {
    desc: "Serialising all proposals through a single coordinator creates a throughput ceiling and a latency bottleneck, particularly for geographically distributed clients. The problem is structural and cannot be eliminated without sharding consensus groups or adopting a leaderless design.",
  },
  "Reconfiguration is underspecified": {
    desc: "Changing the node set while maintaining safety requires careful quorum-intersection reasoning across old and new configurations simultaneously. Getting it wrong can create split-brain situations that are indistinguishable from normal operation until data is lost.",
  },
  "Gap in multi-Paxos specification": {
    desc: "Single-decree consensus agrees on one value; extending it to an ordered log requires answering questions the original formulation leaves open: how uncommitted slots are discovered, how the log is repaired after a leader change, and how it is compacted safely.",
  },
  "No built-in reconfiguration": {
    desc: "Without a specified membership-change primitive, each deployment must invent its own scheme. The resulting ad-hoc approaches are rarely equivalent, are difficult to verify, and have historically been a primary source of production incidents.",
  },
  "Leader election latency spike": {
    desc: "When the current leader is lost, the cluster cannot commit until a successor establishes authority. The gap duration is set by failure-detection timeouts and is directly visible to clients as elevated latency or request failures.",
  },
  "Pre-vote optimization not in spec": {
    desc: "Without a pre-vote phase, a node that was partitioned and reconnects with a higher term can immediately trigger a disruptive election. The fix is well-understood but absent from many canonical specifications.",
  },
  "O(n²) message complexity": {
    desc: "All-to-all vote broadcasting produces O(n²) messages per round. This is manageable at small cluster sizes but becomes the dominant cost above a few dozen nodes, making unbounded horizontal scaling impossible without restructuring the communication pattern.",
  },
  "View-change protocol complexity": {
    desc: "Replacing a failed leader requires a sub-protocol that reconstructs any in-flight consensus instances without violating safety. This sub-protocol is typically as complex as the normal-case protocol and has historically been the primary source of implementation bugs in BFT systems.",
  },
  "Poor scalability beyond ~20 nodes": {
    desc: "Quadratic message complexity or expensive leader-replacement procedures cause throughput to collapse as node count grows, restricting deployment to small, fixed validator sets.",
  },
  "3-round latency in normal case": {
    desc: "Three sequential message exchanges are the minimum required to commit while preserving BFT safety with linear communication — one more round than crash-fault-tolerant protocols. Pipelining saturates throughput but does not reduce per-entry commit latency.",
  },
  "Responsiveness vs. optimism tradeoff": {
    desc: "A protocol is responsive if it advances as soon as a quorum replies. Responsiveness is provably incompatible with O(n) communication in the BFT setting: linear message complexity requires accepting timeout-bounded latency even under favourable network conditions.",
  },
  "Complex dependency tracking": {
    desc: "Allowing concurrent proposals on overlapping keys requires each instance to record which other instances it conflicts with. The resulting dependency graph must be topologically sorted before execution and can grow unboundedly, making recovery and garbage collection expensive.",
  },
  "Slow path with conflicting commands": {
    desc: "A fast commit path is only safe when concurrent proposals are known not to conflict. Detected conflicts require falling back to a slower multi-round path, erasing the latency advantage over leader-based protocols in high-conflict workloads.",
  },
  "Hard to implement correctly": {
    desc: "Some protocols combine several independently subtle mechanisms in ways that interact non-obviously. The difficulty is compounded when the canonical specification itself contains ambiguities or correctness errors.",
  },
  "Slow recovery after timeout": {
    desc: "If rounds can only advance after a fixed timeout rather than on quorum receipt, recovery from a slow or failed proposer takes as long as the timeout. Tuning this value is a tradeoff between spurious timeouts and recovery speed.",
  },
  "Recovery protocol complexity": {
    desc: "After a leader crash, the successor must reconstruct which entries were durably committed and which were merely proposed. The boundary between these states is subtle, and errors cause either data loss or divergence.",
  },
  "Epoch synchronization overhead": {
    desc: "Leadership protocols that version authority with epochs must synchronise all followers to the new epoch before resuming. This synchronisation is proportional to log divergence and can be a significant source of unavailability during frequent leader changes.",
  },
};


const PROTOCOLS = [
  { id:"paxos", name:"Paxos", fullName:"Paxos (Classic)", year:1989,
    properties:{"Safety":true,"Liveness (async network)":false,"Byzantine fault tolerance":false,"Optimistic fast path":false,"Leader-based":true,"Leaderless":false,"Reconfiguration support":false,"Message complexity (normal)":"O(n)","Communication rounds (normal)":2,"Failure rounds":null,"Max. faulty nodes (of n)":"⌊(n−1)/2⌋","Fault model":"Crash","Multi-value consensus":false,"Pipeline support":false,"Rotating leader":false,"Formal verification":true},
    openProblems:{
      // shared (all 7): FLP applies uniformly to all crash-tolerant protocols under partial synchrony
      "Liveness under asynchrony (FLP)":{ difficulty:1, desc:"Assumes partial synchrony; purely asynchronous executions can stall indefinitely." },
      // unique
      "Reconfiguration is underspecified":{ difficulty:3, desc:"Lamport's papers leave membership change entirely unspecified; every deployment has invented its own scheme." },
      // shared (Paxos, Raft, ZAB): non-rotating leader-based CFT protocols
      "Leader bottleneck":{ difficulty:2, desc:"A single node serialises all writes with no rotation; the bottleneck is structural and permanent until a crash forces re-election." },
      // unique
      "Gap in multi-Paxos specification":{ difficulty:3, desc:"Multi-Paxos is described only informally, leaving log-gap handling, leader handoff, and compaction as open implementation questions." },
      // unique
      "No built-in reconfiguration":{ difficulty:3, desc:"No membership-change primitive is specified; implementors must design their own, which is historically the primary source of production bugs." },
      // shared (Paxos, Raft, ZAB): all CFT protocols face the same recovery boundary problem
      "Recovery after leader crash":{ difficulty:2, desc:"The successor must distinguish durably committed entries from merely proposed ones; getting this boundary wrong causes data loss or divergence." },
    }
  },
  { id:"raft", name:"Raft", fullName:"Raft", year:2014,
    properties:{"Safety":true,"Liveness (async network)":false,"Byzantine fault tolerance":false,"Optimistic fast path":false,"Leader-based":true,"Leaderless":false,"Reconfiguration support":true,"Message complexity (normal)":"O(n)","Communication rounds (normal)":2,"Failure rounds":null,"Max. faulty nodes (of n)":"⌊(n−1)/2⌋","Fault model":"Crash","Multi-value consensus":true,"Pipeline support":true,"Rotating leader":false,"Formal verification":true},
    openProblems:{
      // shared (all 7)
      "Liveness under asynchrony (FLP)":{ difficulty:1, desc:"Assumes partial synchrony; purely asynchronous executions can stall indefinitely." },
      // shared (Paxos, Raft, ZAB)
      "Leader bottleneck":{ difficulty:2, desc:"A single node serialises all writes with no rotation; the bottleneck is structural and permanent until a crash forces re-election." },
      // unique
      "Leader election latency spike":{ difficulty:2, desc:"Followers wait for a randomised timeout (typically 150–600 ms) before starting an election; the cluster cannot commit during this window." },
      // unique
      "Pre-vote optimization not in spec":{ difficulty:1, desc:"A partitioned node rejoining with a higher term can depose a healthy leader; the pre-vote fix exists but is not in the original paper." },
      // shared (Paxos, Raft, ZAB)
      "Recovery after leader crash":{ difficulty:2, desc:"The successor must distinguish durably committed entries from merely proposed ones; getting this boundary wrong causes data loss or divergence." },
    }
  },
  { id:"pbft", name:"PBFT", fullName:"Practical Byzantine Fault Tolerance", year:1999,
    properties:{"Safety":true,"Liveness (async network)":false,"Byzantine fault tolerance":true,"Optimistic fast path":false,"Leader-based":true,"Leaderless":false,"Reconfiguration support":false,"Message complexity (normal)":"O(n²)","Communication rounds (normal)":3,"Failure rounds":3,"Max. faulty nodes (of n)":"⌊(n−1)/3⌋","Fault model":"Byzantine","Multi-value consensus":true,"Pipeline support":false,"Rotating leader":false,"Formal verification":false},
    openProblems:{
      // shared (all 7)
      "Liveness under asynchrony (FLP)":{ difficulty:1, desc:"Assumes partial synchrony; purely asynchronous executions can stall indefinitely." },
      // shared (PBFT, Tendermint): both use all-to-all broadcasts
      "O(n²) message complexity":{ difficulty:3, desc:"Every replica broadcasts prepare and commit votes to all others; at 30 nodes this is ~900 messages per round." },
      // unique (PBFT specific: Byzantine primary + no rotation)
      "Leader bottleneck":{ difficulty:3, desc:"The primary serialises all requests with no rotation; a Byzantine primary can selectively delay clients and replacement via view-change is itself O(n²)." },
      // shared (PBFT, Tendermint): both require explicit view-change sub-protocols
      "View-change protocol complexity":{ difficulty:3, desc:"The view-change sub-protocol must reconstruct all in-flight instances from certificate sets exchanged by all replicas; it is as complex as the normal path and has caused most known BFT implementation bugs." },
      // shared (PBFT, Tendermint): same root cause
      "Poor scalability beyond ~20 nodes":{ difficulty:3, desc:"O(n²) messaging and view-change cost cause throughput to collapse; empirical results show degradation starting around 20 replicas." },
    }
  },
  { id:"hotstuff", name:"HotStuff", fullName:"HotStuff", year:2019,
    properties:{"Safety":true,"Liveness (async network)":false,"Byzantine fault tolerance":true,"Optimistic fast path":false,"Leader-based":true,"Leaderless":false,"Reconfiguration support":false,"Message complexity (normal)":"O(n)","Communication rounds (normal)":3,"Failure rounds":3,"Max. faulty nodes (of n)":"⌊(n−1)/3⌋","Fault model":"Byzantine","Multi-value consensus":true,"Pipeline support":true,"Rotating leader":true,"Formal verification":false},
    openProblems:{
      // shared (all 7)
      "Liveness under asynchrony (FLP)":{ difficulty:1, desc:"Assumes partial synchrony; purely asynchronous executions can stall indefinitely." },
      // shared (HotStuff, Tendermint): both are BFT with rotating leaders
      "Leader bottleneck":{ difficulty:1, desc:"Vote aggregation is O(n) via threshold signatures and rotation distributes load over time, but a single node still coordinates every individual round." },
      // unique
      "3-round latency in normal case":{ difficulty:2, desc:"Three rounds (prepare → pre-commit → commit) are the BFT lower bound for linear communication; pipelining hides this in throughput but not in single-shot latency." },
      // unique
      "Responsiveness vs. optimism tradeoff":{ difficulty:2, desc:"Advancing on timeout rather than on quorum response bounds commit latency by the timeout, not by actual network speed." },
    }
  },
  { id:"tendermint", name:"Tendermint", fullName:"Tendermint", year:2014,
    properties:{"Safety":true,"Liveness (async network)":false,"Byzantine fault tolerance":true,"Optimistic fast path":false,"Leader-based":true,"Leaderless":false,"Reconfiguration support":true,"Message complexity (normal)":"O(n²)","Communication rounds (normal)":2,"Failure rounds":null,"Max. faulty nodes (of n)":"⌊(n−1)/3⌋","Fault model":"Byzantine","Multi-value consensus":true,"Pipeline support":false,"Rotating leader":true,"Formal verification":true},
    openProblems:{
      // shared (all 7)
      "Liveness under asynchrony (FLP)":{ difficulty:1, desc:"Assumes partial synchrony; purely asynchronous executions can stall indefinitely." },
      // shared (PBFT, Tendermint)
      "O(n²) message complexity":{ difficulty:3, desc:"Every replica broadcasts prepare and commit votes to all others; at 30 nodes this is ~900 messages per round." },
      // shared (HotStuff, Tendermint)
      "Leader bottleneck":{ difficulty:1, desc:"Vote aggregation is O(n) via threshold signatures and rotation distributes load over time, but a single node still coordinates every individual round." },
      // unique
      "Slow recovery after timeout":{ difficulty:2, desc:"Tendermint only advances to the next round after the full timeout expires, even if a quorum is already ready; tuning this is a hard tradeoff." },
      // shared (PBFT, Tendermint)
      "View-change protocol complexity":{ difficulty:2, desc:"The view-change sub-protocol must reconstruct all in-flight instances from certificate sets exchanged by all replicas; it is as complex as the normal path and has caused most known BFT implementation bugs." },
      // shared (PBFT, Tendermint)
      "Poor scalability beyond ~20 nodes":{ difficulty:2, desc:"O(n²) messaging and view-change cost cause throughput to collapse; empirical results show degradation starting around 20 replicas." },
    }
  },
  { id:"epaxos", name:"EPaxos", fullName:"Egalitarian Paxos", year:2013,
    properties:{"Safety":true,"Liveness (async network)":false,"Byzantine fault tolerance":false,"Optimistic fast path":true,"Leader-based":false,"Leaderless":true,"Reconfiguration support":false,"Message complexity (normal)":"O(n)","Communication rounds (normal)":2,"Failure rounds":null,"Max. faulty nodes (of n)":"⌊(n−1)/2⌋","Fault model":"Crash","Multi-value consensus":true,"Pipeline support":true,"Rotating leader":null,"Formal verification":false},
    openProblems:{
      // shared (all 7)
      "Liveness under asynchrony (FLP)":{ difficulty:1, desc:"Assumes partial synchrony; purely asynchronous executions can stall indefinitely." },
      // unique
      "Complex dependency tracking":{ difficulty:3, desc:"Every instance records which earlier instances it interferes with; the dependency graph grows unboundedly and requires topological sorting before execution." },
      // unique
      "Slow path with conflicting commands":{ difficulty:2, desc:"Conflicting commands fall back from 2-round fast path to 3-round slow path; in write-heavy workloads on shared keys the slow path dominates." },
      // unique
      "Hard to implement correctly":{ difficulty:3, desc:"Leaderless operation, fast/slow paths, dependency tracking, and recovery interact in subtle ways; the original pseudocode contains known correctness errors." },
      // shared (EPaxos, Paxos): both Paxos-family protocols with underspecified operational aspects
      "No built-in reconfiguration":{ difficulty:2, desc:"No membership-change primitive is specified; implementors must design their own, which is historically the primary source of production bugs." },
    }
  },
  { id:"zab", name:"ZAB", fullName:"Zookeeper Atomic Broadcast", year:2011,
    properties:{"Safety":true,"Liveness (async network)":false,"Byzantine fault tolerance":false,"Optimistic fast path":false,"Leader-based":true,"Leaderless":false,"Reconfiguration support":true,"Message complexity (normal)":"O(n)","Communication rounds (normal)":2,"Failure rounds":null,"Max. faulty nodes (of n)":"⌊(n−1)/2⌋","Fault model":"Crash","Multi-value consensus":true,"Pipeline support":true,"Rotating leader":false,"Formal verification":true},
    openProblems:{
      // shared (all 7)
      "Liveness under asynchrony (FLP)":{ difficulty:1, desc:"Assumes partial synchrony; purely asynchronous executions can stall indefinitely." },
      // shared (Paxos, Raft, ZAB)
      "Leader bottleneck":{ difficulty:2, desc:"A single node serialises all writes with no rotation; the bottleneck is structural and permanent until a crash forces re-election." },
      // unique
      "Epoch synchronization overhead":{ difficulty:2, desc:"Each epoch change requires all followers to synchronise their logs with the new leader before resuming; with large logs this can take seconds." },
      // shared (Paxos, Raft, ZAB)
      "Recovery after leader crash":{ difficulty:2, desc:"The successor must distinguish durably committed entries from merely proposed ones; getting this boundary wrong causes data loss or divergence." },
    }
  },
];
const GROUP_META = {
  all:    { color:"#64748B", bg:"rgba(100,116,139,0.08)" },
  partial:{ color:"#64748B", bg:"rgba(100,116,139,0.08)" },
  unique: { color:"#64748B", bg:"rgba(100,116,139,0.08)" },
  numeric:{ color:"#7DD3FC", bg:"rgba(125,211,252,0.08)" },
  string: { color:"#C4B5FD", bg:"rgba(196,181,253,0.08)" },
};

// Get a comparable score for a single protocol on a single property.
// Returns null if the property has no ranking direction.
function propertyScore(val, label) {
  const pm = PROPERTY_META[label];
  if (!pm || pm.rank === "none" || !pm.rank) return null;
  if (val === undefined || val === null) return -Infinity; // missing = worst

  if (pm.type === "bool") {
    if (pm.rank === "true-better")  return val === true  ? 1 : 0;
    if (pm.rank === "false-better") return val === false ? 1 : 0;
  }
  if (pm.type === "number" && typeof val === "number") {
    // We'll return raw value; caller inverts for "lower"
    return pm.rank === "lower" ? -val : val;
  }
  if (pm.type === "string" && pm.rank === "order" && pm.order) {
    const idx = pm.order.indexOf(val);
    return idx === -1 ? -Infinity : idx;
  }
  return null;
}

// Score a protocol on a problem sub-row: absent=0 (best), difficulty 1/2/3 → -1/-2/-3
function problemScore(protocol, item) {
  const diff = item.difficulties?.[protocol.id];
  if (diff == null) return 0; // not in this desc-group
  return -diff;
}

// Lexicographic sort across ordered items.
function lexCompare(a, b, orderedItems) {
  for (const item of orderedItems) {
    let sa, sb;
    if (item.kind === "problem") {
      sa = problemScore(a, item);
      sb = problemScore(b, item);
    } else {
      const pm = PROPERTY_META[item.label];
      if (!pm || pm.rank === "none" || !pm.rank) continue;
      sa = propertyScore(a.properties[item.label], item.label);
      sb = propertyScore(b.properties[item.label], item.label);
      if (sa === null || sb === null) continue;
    }
    if (sa !== sb) return sb - sa;
  }
  return 0;
}

// For each protocol, find at which item index it first diverges from the one to its left.
function getTieBreakRow(sortedProtos, orderedItems, tab) {
  const result = {};
  for (let i = 1; i < sortedProtos.length; i++) {
    const prev = sortedProtos[i - 1];
    const curr = sortedProtos[i];
    for (let j = 0; j < orderedItems.length; j++) {
      const item = orderedItems[j];
      let sp, sc;
      if (tab === "openProblems") {
        sp = problemScore(prev, item);
        sc = problemScore(curr, item);
      } else {
        const pm = PROPERTY_META[item.label];
        if (!pm || pm.rank === "none" || !pm.rank) continue;
        sp = propertyScore(prev.properties[item.label], item.label);
        sc = propertyScore(curr.properties[item.label], item.label);
        if (sp === null || sc === null) continue;
      }
      if (sp !== sc) { result[curr.id] = j; break; }
    }
  }
  return result;
}

// Shared colour helper for property cells: same logic as problems tab
// Returns cellBg, bTop, bBot, bLeft, bRight
function getPropCellStyle(protocolId, valKey, hasVal, rowIdx, valueGroups, protocolValueGroup, sortedProtocols, colorCells, isHovRow) {
  const ROW_HUES = [210, 260, 185, 330, 220, 280, 195, 315, 240, 170];
  const baseHue = ROW_HUES[rowIdx % ROW_HUES.length];
  const shadeOffsets = [0, 30, 15, 45];

  const localGrpIdx = protocolValueGroup?.[protocolId] ?? 0;
  const grpIds = valueGroups?.[valKey] ?? [];
  const grpSize = grpIds.length;
  const isShared = grpSize > 1;

  const hue = (baseHue + shadeOffsets[localGrpIdx % shadeOffsets.length]) % 360;
  const bgAlpha = isShared ? 0.20 : 0.07;
  const brdColor = `hsla(${hue},70%,65%,0.7)`;
  const cellBgColor = `hsla(${hue},65%,65%,${bgAlpha})`;

  const showColor = hasVal && (colorCells || isHovRow);

  const sortedGrpIds = sortedProtocols.map(sp => sp.id).filter(id => grpIds.includes(id));
  const posInGrp = sortedGrpIds.indexOf(protocolId);
  const isFirstInGrp = posInGrp === 0;
  const isLastInGrp  = posInGrp === sortedGrpIds.length - 1;

  return {
    cellBg: showColor ? cellBgColor : (isHovRow ? "#111825" : "#0D0F14"),
    bTop:   showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520",
    bBot:   showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520",
    bLeft:  showColor && isShared && isFirstInGrp ? `2px solid ${brdColor}` : "none",
    bRight: showColor && isShared && isLastInGrp  ? `2px solid ${brdColor}` : "1px solid #111520",
  };
}

function getBestIds(label, values, protocols) {
  const pm = PROPERTY_META[label];
  if (!pm || pm.rank === "none" || !pm.rank) return new Set();
  const entries = protocols.map(p => ({ id:p.id, val:values[p.id] })).filter(e => e.val != null);
  if (!entries.length) return new Set();
  let best = [];
  if (pm.type === "bool") {
    const target = pm.rank === "true-better";
    best = entries.filter(e => e.val === target);
    if (!best.length || best.length === entries.length) return new Set();
  } else if (pm.type === "number") {
    const nums = entries.filter(e => typeof e.val === "number");
    if (!nums.length) return new Set();
    const bv = pm.rank === "lower" ? Math.min(...nums.map(e=>e.val)) : Math.max(...nums.map(e=>e.val));
    best = nums.filter(e => e.val === bv);
    if (best.length === nums.length) return new Set();
  } else if (pm.type === "string" && pm.rank === "order" && pm.order) {
    const ranked = entries.map(e=>({id:e.id,r:pm.order.indexOf(e.val)})).filter(e=>e.r!==-1);
    if (!ranked.length) return new Set();
    const br = Math.max(...ranked.map(e=>e.r));
    best = ranked.filter(e=>e.r===br);
    if (best.length === ranked.length) return new Set();
  }
  return new Set(best.map(e => e.id));
}

export default function App() {
  const [selected, setSelected] = useState(["paxos","raft","pbft","hotstuff","tendermint","epaxos"]);
  const [rowOrders, setRowOrders] = useState({ properties: null, problems: null });
  const [sortFirst, setSortFirst] = useState("properties"); // "properties" | "problems"
  const [collapsedSections, setCollapsedSections] = useState(new Set()); // "properties" | "problems"
  const toggleSection = useCallback((s) => setCollapsedSections(prev => {
    const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next;
  }), []);
  const rowOrder = rowOrders[sortFirst] ?? null;
  const setRowOrder = useCallback((v) => setRowOrders(prev => ({ ...prev, [sortFirst]: v })), [sortFirst]);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [hiddenProps, setHiddenProps] = useState(new Set());

  const toggleHide = useCallback((label) => {
    setHiddenProps(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);
  const [clickRankMode, setClickRankMode] = useState(false); // click-to-rank mode
  const [colorCells, setColorCells] = useState(false); // colour-by-description mode
  const [clickRankOrder, setClickRankOrder] = useState([]); // labels in click order
  const [tooltip, setTooltip] = useState(null); // {label, desc, x, y}
  const tooltipTimer = useRef(null);
  const hideTimer = useRef(null);
  const isOverTooltip = useRef(false);
  const isOverLabel = useRef(false);

  const showTooltip = useCallback((e, label, desc) => {
    if (!desc) return;
    isOverLabel.current = true;
    clearTimeout(tooltipTimer.current);
    clearTimeout(hideTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    tooltipTimer.current = setTimeout(() => {
      const TOOLTIP_W = 380;
      let x = rect.right + 12;
      let y = rect.top;
      if (x + TOOLTIP_W > window.innerWidth - 12) x = rect.left - TOOLTIP_W - 12;
      y = Math.min(y, window.innerHeight - 320);
      setTooltip({ label, desc, x, y });
    }, 250);
  }, []);

  const hideTooltip = useCallback(() => {
    isOverLabel.current = false;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isOverTooltip.current && !isOverLabel.current) {
        clearTimeout(tooltipTimer.current);
        setTooltip(null);
      }
    }, 120);
  }, []);

  const onTooltipEnter = useCallback(() => {
    isOverTooltip.current = true;
    clearTimeout(hideTimer.current);
  }, []);

  const onTooltipLeave = useCallback(() => {
    isOverTooltip.current = false;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isOverTooltip.current && !isOverLabel.current) {
        clearTimeout(tooltipTimer.current);
        setTooltip(null);
      }
    }, 120);
  }, []);

  const toggleExpand = useCallback((label) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);

  // Click-to-rank: enter/exit mode, record click order, apply when done
  const enterClickRank = useCallback(() => {
    setClickRankMode(true);
    setClickRankOrder([]);
  }, []);

  const exitClickRank = useCallback((items) => {
    setClickRankMode(false);
    if (clickRankOrder.length > 0) {
      // Build full order: clicked items first, then remaining in current order
      const clicked = clickRankOrder;
      const rest = (items||[]).map(i=>i.label).filter(l => !clicked.includes(l));
      setRowOrder([...clicked, ...rest]);
    }
    setClickRankOrder([]);
  }, [clickRankOrder]);

  const handleClickRank = useCallback((label, isRankable, items) => {
    if (!isRankable) return;
    setClickRankOrder(prev => {
      if (prev.includes(label)) return prev; // already ranked
      const next = [...prev, label];
      // Auto-finish when all rankable rows clicked
      const rankableLabels = (items||[]).filter(i => {
        if (i.__divider || hiddenProps.has(i.label)) return false;
        if (i.kind === "problem") return true; // all problems are rankable
        const pm = PROPERTY_META[i.label];
        return pm && pm.rank && pm.rank !== "none";
      }).map(i=>i.label);
      if (next.length >= rankableLabels.length) {
        setTimeout(() => {
          const rest = (items||[]).map(i=>i.label).filter(l => !next.includes(l));
          setRowOrder([...next, ...rest]);
          setClickRankMode(false);
          setClickRankOrder([]);
        }, 200);
      }
      return next;
    });
  }, []);

  const dragIdx = useRef(null);
  const dragOverIdx = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);


  const protocols = PROTOCOLS.filter(p => selected.includes(p.id));
  const total = protocols.length;

  // Build row items — always build both properties and problems
  const { propItems, probItems } = useMemo(() => {
    // ── Problems ──────────────────────────────────────────────────────────────
    const seen = {};
    protocols.forEach(p => {
      Object.entries(p.openProblems ?? {}).forEach(([problemName, entry]) => {
        if (!seen[problemName]) seen[problemName] = {};
        seen[problemName][p.id] = { difficulty: entry.difficulty ?? 1, desc: entry.desc ?? null };
      });
    });
    const descColorMap = {};
    let colorCounter = 0;
    Object.values(seen).forEach(allProtocolData => {
      Object.values(allProtocolData).forEach(({ desc }) => {
        const key = desc ?? "";
        if (!(key in descColorMap)) descColorMap[key] = colorCounter++;
      });
    });
    const probItems = Object.entries(seen).map(([problemName, allProtocolData]) => {
      const affected = protocols.filter(p => allProtocolData[p.id] != null);
      const count = affected.length;
      const maxDiff = Math.max(...affected.map(p => allProtocolData[p.id].difficulty));
      const groupKey = count === total ? (maxDiff >= 3 ? "unique" : maxDiff >= 2 ? "partial" : "all")
        : count === 1 ? "unique" : "partial";
      const descGroups = {};
      affected.forEach(p => {
        const d = allProtocolData[p.id].desc ?? "";
        if (!descGroups[d]) descGroups[d] = [];
        descGroups[d].push(p.id);
      });
      const protocolDescGroup = {};
      affected.forEach(p => { protocolDescGroup[p.id] = descColorMap[allProtocolData[p.id].desc ?? ""]; });
      return {
        label: problemName, problemName, allProtocolData, descGroups, protocolDescGroup,
        count, groupKey, kind: "problem", bestIds: new Set(),
        difficulties: Object.fromEntries(affected.map(p => [p.id, allProtocolData[p.id].difficulty])),
      };
    });

    // ── Properties ────────────────────────────────────────────────────────────
    const map = {};
    protocols.forEach(p => {
      Object.entries(p.properties).forEach(([label, val]) => {
        if (!map[label]) map[label] = { label, values:{}, kind:"bool" };
        map[label].values[p.id] = val;
        if (typeof val === "number") map[label].kind = "numeric";
        else if (typeof val === "string") map[label].kind = "string";
      });
    });
    const propItems = Object.values(map).map(row => {
      const bestIds = getBestIds(row.label, row.values, protocols);
      const valueGroups = {};
      protocols.forEach(p => {
        const v = row.values[p.id];
        if (v === undefined || v === null) return;
        const key = String(v);
        if (!valueGroups[key]) valueGroups[key] = [];
        valueGroups[key].push(p.id);
      });
      const protocolValueGroup = {};
      Object.values(valueGroups).forEach((ids, gi) => ids.forEach(id => { protocolValueGroup[id] = gi; }));
      if (row.kind === "numeric") {
        const ids = new Set(protocols.filter(p=>typeof row.values[p.id]==="number").map(p=>p.id));
        return { ...row, ids, count:ids.size, groupKey:"numeric", bestIds, valueGroups, protocolValueGroup };
      }
      if (row.kind === "string") {
        const vals = protocols.map(p=>row.values[p.id]).filter(v=>v!=null);
        const ids = new Set(protocols.filter(p=>row.values[p.id]!=null).map(p=>p.id));
        return { ...row, ids, count:ids.size, groupKey:"string", allSame:new Set(vals).size===1, bestIds, valueGroups, protocolValueGroup };
      }
      const trueIds = new Set(protocols.filter(p=>row.values[p.id]===true).map(p=>p.id));
      const count = trueIds.size;
      const groupKey = total<=1?"all": count===total?"all": count===1?"unique": count===0?"unique":"partial";
      return { ...row, ids:trueIds, count, groupKey, bestIds, valueGroups, protocolValueGroup };
    });
    return { propItems, probItems };
  }, [selected]);

  const baseItems = useMemo(() => [...propItems, ...probItems], [propItems, probItems]);
  const defaultItems = baseItems;

  const allItems = useMemo(() => {
    // Apply rowOrder within each section independently
    const applyOrder = (items, order) => {
      if (!order) return items;
      const byLabel = Object.fromEntries(items.map(i=>[i.label,i]));
      const inOrder = order.filter(l=>byLabel[l]).map(l=>byLabel[l]);
      const rest = items.filter(i=>!order.includes(i.label));
      return [...inOrder, ...rest];
    };
    const orderedProps = applyOrder(propItems, rowOrders.properties);
    const orderedProbs = applyOrder(probItems, rowOrders.problems);
    const result = [];
    // Properties section
    const visProps = orderedProps.filter(i => !hiddenProps.has(i.label));
    const hidProps = orderedProps.filter(i => hiddenProps.has(i.label));
    result.push({ __divider: true, key: "properties", label: "PROPERTIES", collapsible: true });
    if (!collapsedSections.has("properties")) result.push(...visProps);
    // Problems section
    const visProbs = orderedProbs.filter(i => !hiddenProps.has(i.label));
    result.push({ __divider: true, key: "problems", label: "OPEN PROBLEMS", collapsible: true });
    if (!collapsedSections.has("problems")) result.push(...visProbs);
    // Hidden
    if (hidProps.length) {
      result.push({ __divider: true, key: "hidden", label: "HIDDEN" });
      result.push(...hidProps);
    }
    return result;
  }, [propItems, probItems, rowOrders, hiddenProps, collapsedSections]);

  // rankItems: sortFirst section first, then the other — respects drag order
  const rankItems = useMemo(() => {
    const applyOrder = (items, order) => {
      if (!order) return items;
      const byLabel = Object.fromEntries(items.map(i => [i.label, i]));
      const inOrder = order.filter(l => byLabel[l]).map(l => byLabel[l]);
      const rest = items.filter(i => !order.includes(i.label));
      return [...inOrder, ...rest];
    };
    const props = applyOrder(propItems, rowOrders.properties).filter(i => !hiddenProps.has(i.label));
    const probs = applyOrder(probItems, rowOrders.problems).filter(i => !hiddenProps.has(i.label));
    return sortFirst === "properties" ? [...props, ...probs] : [...probs, ...props];
  }, [propItems, probItems, rowOrders, hiddenProps, sortFirst]);

  // Lexicographic sort of protocol columns — always active
  const sortedProtocols = useMemo(() => {
    return [...protocols].sort((a,b) => lexCompare(a, b, rankItems));
  }, [protocols, rankItems]);

  const rankPos = useMemo(() => {
    const pos={};
    sortedProtocols.forEach((p,i)=>{ pos[p.id]=i; });
    return pos;
  }, [sortedProtocols]);

  // Which row index caused each protocol to separate from its left neighbour
  const rankingActive = true;

  // Drag handlers
  const onDragStart = useCallback((e, idx) => {
    dragIdx.current = idx;
    setDragging(idx);
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.style.cssText = "position:fixed;top:-999px;opacity:0;";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const onDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx.current !== idx) { dragOverIdx.current = idx; setDragOver(idx); }
  }, []);

  const onDrop = useCallback((e, idx) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) return;
    // Work only with non-divider, non-hidden labels
    // Determine which section the dragged item belongs to
    const draggedItem = allItems.find(i=>!i.__divider && i.label === allItems.filter(i=>!i.__divider)[from - allItems.slice(0,from).filter(i=>i.__divider).length]?.label);
    const section = draggedItem?.kind === "problem" ? "problems" : "properties";
    const sectionItems = section === "problems" ? probItems : propItems;
    const cur = sectionItems.filter(i => !hiddenProps.has(i.label)).map(i=>i.label);
    // Map real indices (excluding dividers/hidden) back from display idx
    const dispItems = allItems;
    const fromLabel = dispItems[from]?.label;
    const toLabel   = dispItems[idx]?.label;
    if (!fromLabel || !toLabel || fromLabel === toLabel) return;
    const next = [...cur];
    const fi = next.indexOf(fromLabel), ti = next.indexOf(toLabel);
    if (fi === -1 || ti === -1) return;
    next.splice(fi, 1);
    next.splice(ti, 0, fromLabel);
    // Append hidden labels at end to preserve them in rowOrder
    const hiddenLabels = [...hiddenProps];
    setRowOrders(prev => ({ ...prev, [section]: [...next, ...hiddenLabels] }));
    setDragging(null); setDragOver(null);
    dragIdx.current = null; dragOverIdx.current = null;
  }, [allItems, hiddenProps]);

  const onDragEnd = useCallback(() => {
    setDragging(null); setDragOver(null);
    dragIdx.current = null; dragOverIdx.current = null;
  }, []);

  const HANDLE_W=28, LABEL_W=272, CELL_W=140, COV_W=44;
  const RANK_COLORS = ["#FACC15","#94A3B8","#CD7C3A","#4A5568","#374151","#2D3748","#1E2433"];

  return (
    <div style={{minHeight:"100vh",background:"#0D0F14",color:"#CDD5E0",fontFamily:"'DM Mono','Fira Mono',monospace",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Syne:wght@700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#0D0F14; }
        ::-webkit-scrollbar-thumb { background:#1E2433; border-radius:3px; }
        button { cursor:pointer; border:none; background:none; font-family:inherit; }
        td, th { transition:background 0.07s; }
        .drag-handle { opacity:0; transition:opacity 0.12s; cursor:grab; }
        tr:hover .drag-handle { opacity:1; }
        .drag-handle:active { cursor:grabbing; }
      `}</style>

      {/* ── Header ── */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid #161B27",display:"flex",alignItems:"center",gap:16,flexShrink:0,background:"linear-gradient(90deg,rgba(52,211,153,0.05) 0%,transparent 50%)"}}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="0" y="0" width="12" height="12" rx="2" fill="#34D399"/>
          <rect x="16" y="0" width="12" height="12" rx="2" fill="#34D399" opacity="0.35"/>
          <rect x="0" y="16" width="12" height="12" rx="2" fill="#34D399" opacity="0.35"/>
          <rect x="16" y="16" width="12" height="12" rx="2" fill="#34D399" opacity="0.12"/>
        </svg>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16,color:"#EDF2F7",letterSpacing:"-0.02em"}}>Consensus Protocol Comparator</h1>
          <p style={{fontSize:9,color:"#2D3748",marginTop:2,letterSpacing:"0.1em"}}>PAXOS · RAFT · PBFT · HOTSTUFF · TENDERMINT · EPAXOS · ZAB</p>
        </div>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:9,color:"#2D3748",letterSpacing:"0.1em"}}>SORT FIRST</span>
          <div style={{display:"flex",background:"#111520",borderRadius:6,padding:3,border:"1px solid #1A1F2E",gap:2}}>
            {[["properties","Properties"],["problems","Problems"]].map(([s,lbl])=>(
              <button key={s} onClick={()=>setSortFirst(s)} style={{padding:"5px 14px",borderRadius:4,fontSize:10,letterSpacing:"0.07em",fontWeight:sortFirst===s?500:400,background:sortFirst===s?"#1A2035":"transparent",color:sortFirst===s?"#EDF2F7":"#4A5568",border:sortFirst===s?"1px solid #2D3748":"1px solid transparent",transition:"all 0.12s"}}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Protocol pills ── */}
      <div style={{padding:"10px 24px",borderBottom:"1px solid #161B27",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flexShrink:0}}>
        <span style={{fontSize:9,color:"#2D3748",letterSpacing:"0.12em",marginRight:4}}>PROTOCOLS</span>
        {PROTOCOLS.map(p=>{
          const on=selected.includes(p.id);
          return (
            <button key={p.id} onClick={()=>toggle(p.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 11px",borderRadius:5,border:`1px solid ${on?"#34D39940":"#1A1F2E"}`,background:on?"rgba(52,211,153,0.07)":"transparent",color:on?"#34D399":"#4A5568",fontSize:11,fontWeight:on?500:400,letterSpacing:"0.02em",transition:"all 0.12s"}}>
              <span style={{width:11,height:11,borderRadius:3,flexShrink:0,border:`1.5px solid ${on?"#34D399":"#2D3748"}`,background:on?"#34D399":"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s"}}>
                {on&&<svg width="7" height="5" viewBox="0 0 7 5"><path d="M1 2.5L2.8 4.2L6 1" stroke="#0D0F14" strokeWidth="1.5" strokeLinecap="round"/></svg>}
              </span>
              {p.name}<span style={{fontSize:9,opacity:0.4}}>{p.year}</span>
            </button>
          );
        })}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {!clickRankMode && (
            <button onClick={enterClickRank} style={{
              fontSize:9, color:"#FBBF24", padding:"3px 10px", borderRadius:4,
              border:"1px solid rgba(251,191,36,0.3)", background:"rgba(251,191,36,0.06)",
              letterSpacing:"0.07em", transition:"all 0.12s",
            }}>CLICK TO RANK</button>
          )}
          {clickRankMode && (
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:9,color:"#FBBF24",letterSpacing:"0.07em"}}>
                {clickRankOrder.length === 0
                  ? "CLICK ROWS IN PRIORITY ORDER"
                  : `${clickRankOrder.length} RANKED — KEEP CLICKING OR`}
              </span>
              <button onClick={()=>exitClickRank(allItems)} style={{
                fontSize:9, color:"#FACC15", padding:"3px 10px", borderRadius:4,
                border:"1px solid rgba(250,204,21,0.4)", background:"rgba(250,204,21,0.08)",
                letterSpacing:"0.07em",
              }}>DONE</button>
              <button onClick={()=>{setClickRankMode(false);setClickRankOrder([]);}} style={{
                fontSize:9, color:"#4A5568", padding:"3px 10px", borderRadius:4,
                border:"1px solid #1E2433", background:"transparent", letterSpacing:"0.07em",
              }}>CANCEL</button>
            </div>
          )}
          {true && (
            <button
              onClick={()=>setColorCells(v=>!v)}
              style={{
                fontSize:9, letterSpacing:"0.07em", padding:"3px 10px", borderRadius:4,
                border: colorCells ? "1px solid rgba(125,211,252,0.4)" : "1px solid #1E2433",
                background: colorCells ? "rgba(125,211,252,0.08)" : "transparent",
                color: colorCells ? "#7DD3FC" : "#4A5568",
                transition:"all 0.12s",
              }}>
              {colorCells ? "COLOUR ON" : "COLOUR OFF"}
            </button>
          )}
        </div>
      </div>

      {/* ── Matrix ── */}
      {total===0 ? (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#2D3748"}}>
          <span style={{fontSize:11,letterSpacing:"0.1em"}}>SELECT PROTOCOLS TO COMPARE</span>
        </div>
      ) : (
        <div style={{flex:1,overflow:"auto"}}>
          <table style={{borderCollapse:"collapse",minWidth:"100%"}}>
            <thead>
              <tr>
                <th style={{position:"sticky",left:0,top:0,zIndex:13,width:HANDLE_W,minWidth:HANDLE_W,background:"#0D0F14",borderBottom:"2px solid #1E2433",borderRight:"1px solid #161B27"}}/>
                <th style={{position:"sticky",left:HANDLE_W,top:0,zIndex:13,width:LABEL_W,minWidth:LABEL_W,background:"#0D0F14",borderRight:"1px solid #161B27",borderBottom:"2px solid #1E2433",padding:"10px 16px",textAlign:"left",fontSize:9,color:"#2D3748",letterSpacing:"0.12em"}}>
                  "drag to prioritise"
                </th>
                {sortedProtocols.map((p)=>{
                  const rank=rankPos[p.id];
                  const rc=RANK_COLORS[rank]??"#2D3748";
                  const isTop=rankingActive&&rank===0;
                  return (
                    <th key={p.id}
                      onMouseEnter={()=>setHoveredCol(p.id)}
                      onMouseLeave={()=>setHoveredCol(null)}
                      style={{position:"sticky",top:0,zIndex:10,width:CELL_W,minWidth:CELL_W,background:hoveredCol===p.id?"#111825":"#0D0F14",borderBottom:"2px solid #1E2433",borderRight:"1px solid #161B27",padding:"6px 6px 8px",textAlign:"center",cursor:"default",transition:"background 0.15s"}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:hoveredCol===p.id?"#EDF2F7":"#718096",letterSpacing:"-0.01em"}}>{p.name}</div>
                      <div style={{fontSize:8,color:"#2D3748",marginTop:1}}>{p.year}</div>
                    </th>
                  );
                })}
                <th style={{position:"sticky",top:0,zIndex:10,width:COV_W,minWidth:COV_W,background:"#0D0F14",borderBottom:"2px solid #1E2433",padding:"8px",fontSize:9,color:"#2D3748",letterSpacing:"0.1em",textAlign:"center"}}>CVR</th>
              </tr>
            </thead>

            <tbody>
              {allItems.map((item, rowIdx) => {
                const idx = rowIdx;
                // ── Section divider ──
                if (item.__divider) {
                  const isCollapsed = item.collapsible && collapsedSections.has(item.key);
                  const isHidden = item.key === "hidden";
                  return (
                    <tr key={`divider-${item.key}`}>
                      <td colSpan={sortedProtocols.length + 3} style={{
                        padding:"6px 14px 4px",
                        background: isHidden ? "#0A0C11" : "#0F1319",
                        borderBottom:"1px solid #1A1F2E",
                        borderTop: idx > 0 ? "2px solid #1A1F2E" : "none",
                        cursor: item.collapsible ? "pointer" : "default",
                      }} onClick={item.collapsible ? () => toggleSection(item.key) : undefined}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                          {item.collapsible && (
                            <span style={{fontSize:9,color:"#4A5568"}}>{isCollapsed ? "▸" : "▾"}</span>
                          )}
                          <span style={{
                            fontSize:8, fontWeight:600, letterSpacing:"0.14em",
                            color: isHidden ? "#2D3748" : "#34D39950",
                          }}>{item.label}</span>
                          {item.collapsible && isCollapsed && (
                            <span style={{fontSize:8,color:"#1E2433",letterSpacing:"0.08em"}}>— COLLAPSED</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                const {label,ids,count,kind,values,allSame,bestIds,groupKey,
                       problemName,allProtocolData,descGroups,protocolDescGroup,difficulties,
                       valueGroups,protocolValueGroup}=item;
                const isHiddenRow = hiddenProps.has(label);
                const meta=GROUP_META[groupKey]??GROUP_META.unique;
                const rowKey=`row-${idx}`;
                const isHovRow=hoveredRow===rowKey;
                const isDraggingThis=dragging===idx;
                const isDragTarget=dragOver===idx&&dragging!==idx;
                const pm=PROPERTY_META[label];
                const isRankable=item.kind==="problem" || (pm&&pm.rank&&pm.rank!=="none");
                const desc = kind !== "problem"
                  ? (pm?.desc ?? null)
                  : (OPEN_PROBLEM_META[label]?.desc ?? null);
                const hasExpandContent = desc;

                const isTieBreaker = false;
                const separatedIds = new Set();

                return (
                  <tr
                    key={label}
                    draggable={!isHiddenRow}
                    onDragStart={!isHiddenRow ? e=>onDragStart(e,idx) : undefined}
                    onDragOver={!isHiddenRow ? e=>onDragOver(e,idx) : undefined}
                    onDrop={!isHiddenRow ? e=>onDrop(e,idx) : undefined}
                    onDragEnd={!isHiddenRow ? onDragEnd : undefined}
                    onMouseEnter={()=>setHoveredRow(rowKey)}
                    onMouseLeave={()=>setHoveredRow(null)}
                    style={{opacity:isDraggingThis?0.3:(isHiddenRow?0.38:1),outline:isDragTarget?"1px solid rgba(250,204,21,0.35)":"none",transition:"opacity 0.1s"}}
                  >
                    {/* Handle */}
                    <td style={{position:"sticky",left:0,zIndex:7,width:HANDLE_W,minWidth:HANDLE_W,background:isDragTarget?"rgba(250,204,21,0.04)":(isHovRow?"#111520":"#0D0F14"),borderBottom:"1px solid #111520",borderRight:"1px solid #161B27",textAlign:"center",verticalAlign:"top",paddingTop:10,height:"auto",minHeight:36}}>
                      {!isHiddenRow&&(
                        <div className="drag-handle" style={{display:"inline-flex",flexDirection:"column",gap:2.5,padding:"4px",borderRadius:3}}>
                          {[0,1,2].map(i=>(
                            <div key={i} style={{display:"flex",gap:2.5}}>
                              {[0,1].map(j=>(
                                <div key={j} style={{width:2.5,height:2.5,borderRadius:"50%",background:"#3D4A5C"}}/>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Label */}
                    {(()=>{
                      const isExpanded = expandedRows.has(label);
                      const clickRankPos = clickRankOrder.indexOf(label);
                      const isClickRanked = clickRankPos !== -1;
                      const isNextToRank = clickRankMode && isRankable && !isClickRanked;
                      const labelColor = clickRankMode && isRankable
                        ? (isClickRanked ? "#FACC15" : (isNextToRank ? "#EDF2F7" : "#4A5568"))
                        : (isHovRow ? "#EDF2F7" : "#8899A6");
                      return (
                        <td
                          onClick={clickRankMode && isRankable ? () => handleClickRank(label, isRankable, allItems) : undefined}
                          style={{
                            position:"sticky", left:HANDLE_W, zIndex:6,
                            width:LABEL_W, minWidth:LABEL_W,
                            background:isDragTarget?"rgba(250,204,21,0.04)":(isClickRanked?"rgba(250,204,21,0.05)":(isHovRow?"#111520":"#0D0F14")),
                            borderRight:"1px solid #161B27",
                            borderBottom:"1px solid #111520",
                            borderLeft:`3px solid ${isClickRanked?"#FACC1580":(isHovRow?meta.color:meta.color+"40")}`,
                            padding: (isExpanded || kind==="problem") ? "8px 14px" : "0 14px",
                            height: (isExpanded || kind==="problem") ? "auto" : 36,
                            cursor: clickRankMode && isRankable ? "pointer" : "default",
                            transition:"background 0.07s,border-color 0.07s",
                            outline: isNextToRank && isHovRow ? `1px solid rgba(251,191,36,0.4)` : "none",
                          }}>
                          {/* Top row: rank badge, type badge, label text, buttons */}
                          <div style={{display:"flex",alignItems:"center",gap:6, minHeight:20}}>
                            {clickRankMode && isRankable && (
                              <span style={{fontSize:9,fontWeight:700,minWidth:16,flexShrink:0,color:isClickRanked?"#FACC15":"#2D3748",letterSpacing:"0.02em",fontVariantNumeric:"tabular-nums"}}>
                                {isClickRanked ? `${clickRankPos+1}` : "·"}
                              </span>
                            )}
                            {rankingActive && !clickRankMode && isRankable && (()=>{
                              const rankIdx = rankItems.findIndex(i=>i.label===label);
                              return rankIdx === -1 ? null : (
                                <span style={{fontSize:9,fontWeight:600,color:"#4A5568",minWidth:16,flexShrink:0,letterSpacing:"0.02em",fontVariantNumeric:"tabular-nums"}}>
                                  {rankIdx+1}
                                </span>
                              );
                            })()}
                            {kind==="numeric"&&<span style={{fontSize:8,fontWeight:500,color:meta.color,opacity:0.8,background:meta.bg,border:`1px solid ${meta.color}30`,borderRadius:3,padding:"1px 4px",flexShrink:0}}>№</span>}
                            {kind==="string"&&<span style={{fontSize:8,fontWeight:500,color:meta.color,opacity:0.8,background:meta.bg,border:`1px solid ${meta.color}30`,borderRadius:3,padding:"1px 4px",flexShrink:0}}>abc</span>}
                            <div
                              onMouseEnter={desc && !clickRankMode ? e => showTooltip(e, problemName ?? label, desc) : undefined}
                              onMouseLeave={desc && !clickRankMode ? hideTooltip : undefined}
                              style={{
                                fontSize:11.5, color:labelColor,
                                whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                                transition:"color 0.07s", flex:1,
                                cursor: desc && !clickRankMode ? "help" : "default",
                              }}>
                              {kind==="problem" ? problemName : label}
                            </div>
                            {hasExpandContent && !clickRankMode && (
                              <button onClick={e=>{e.stopPropagation();toggleExpand(label);}} title={isExpanded?"Collapse":"Show description"}
                                style={{flexShrink:0,width:16,height:16,borderRadius:3,background:isExpanded?meta.color+"30":"transparent",border:`1px solid ${isExpanded?meta.color+"80":"#2D3748"}`,color:isExpanded?meta.color:"#4A5568",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s",cursor:"pointer"}}>
                                {isExpanded?"−":"+"}
                              </button>
                            )}
                            {!clickRankMode && (
                              <button onClick={e=>{e.stopPropagation();toggleHide(label);}} title={isHiddenRow?"Restore":"Hide"}
                                style={{flexShrink:0,width:16,height:16,borderRadius:3,background:"transparent",border:`1px solid ${isHiddenRow?"#4A5568":"#1E2433"}`,color:isHiddenRow?"#64748B":"#2D3748",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s",cursor:"pointer"}}
                                onMouseEnter={e=>{e.currentTarget.style.borderColor=isHiddenRow?"#64748B":"#F87171";e.currentTarget.style.color=isHiddenRow?"#94A3B8":"#F87171";}}
                                onMouseLeave={e=>{e.currentTarget.style.borderColor=isHiddenRow?"#4A5568":"#1E2433";e.currentTarget.style.color=isHiddenRow?"#64748B":"#2D3748";}}>
                                {isHiddenRow?"↩":"×"}
                              </button>
                            )}

                          </div>
                          {/* Property / problem expanded description */}
                          {isExpanded && desc && (
                            <div style={{marginTop:7,paddingTop:7,borderTop:`1px solid ${meta.color}25`,fontSize:11,color:"#6B7A90",lineHeight:1.7,fontFamily:"system-ui,sans-serif",whiteSpace:"normal"}}>
                              {parseDesc(desc)}
                            </div>
                          )}

                        </td>
                      );
                    })()}

                    {/* Value cells */}
                    {sortedProtocols.map(p=>{
                      const val=values?.[p.id];
                      const colHov=hoveredCol===p.id;
                      const lit=isHovRow||colHov;
                      const isBest=false;
                      const isDecidingCell=rankingActive&&separatedIds.has(p.id);
                      const bestBg="rgba(250,204,21,0.1)";
                      const bestShadow=`inset 0 0 0 1.5px rgba(250,204,21,0.45)`;
                      const decidingShadow=`inset 0 0 0 1.5px rgba(250,204,21,0.2)`;

                      // ── Problem cell ──────────────────────────────────────────────
                      if(kind==="problem"){
                        const protoData = allProtocolData?.[p.id];
                        const cellDesc = protoData?.desc ?? null;
                        const cellDiff = protoData?.difficulty ?? null;
                        const cellDc   = cellDiff ? DIFFICULTY_COLOR[cellDiff] : "#2D3748";
                        const affected = protoData != null;

                        // Per-row base hues (avoids green/yellow/red)
                        const ROW_HUES = [210, 260, 185, 330, 220, 280, 195, 315, 240, 170];
                        const baseHue = ROW_HUES[rowIdx % ROW_HUES.length];

                        // Within a row: how many distinct desc groups?
                        const numGroups = descGroups ? Object.keys(descGroups).length : 1;
                        // Local desc group index for this cell (0, 1, 2…)
                        const localGrpIdx = protocolDescGroup?.[p.id] ?? 0;
                        // Group size: how many protocols share this cell's desc?
                        const grpKey = cellDesc ?? "";
                        const grpSize = descGroups?.[grpKey]?.length ?? 1;
                        const isShared = grpSize > 1;

                        // Vary hue per local group so multiple shared groups are distinguishable
                        const shadeOffsets = [0, 30, 15, 45];
                        const hue = (baseHue + shadeOffsets[localGrpIdx % shadeOffsets.length]) % 360;
                        const bgAlpha = isShared ? 0.20 : 0.07;
                        const brdColor = `hsla(${hue},70%,65%,0.7)`;
                        const cellBgColor = `hsla(${hue},65%,65%,${bgAlpha})`;

                        const showColor = affected && (colorCells || isHovRow);

                        // Band border: only for shared groups, only when colour is showing
                        // Determine if this cell is first/last in its desc group within sortedProtocols
                        const grpIds = descGroups?.[grpKey] ?? [];
                        const sortedGrpIds = sortedProtocols.map(sp => sp.id).filter(id => grpIds.includes(id));
                        const posInGrp = sortedGrpIds.indexOf(p.id);
                        const isFirstInGrp = posInGrp === 0;
                        const isLastInGrp  = posInGrp === sortedGrpIds.length - 1;

                        const bandTop    = showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520";
                        const bandBottom = showColor && isShared ? `2px solid ${brdColor}` : "1px solid #111520";
                        const bandLeft   = showColor && isShared && isFirstInGrp ? `2px solid ${brdColor}` : "none";
                        const bandRight  = showColor && isShared && isLastInGrp  ? `2px solid ${brdColor}` : "1px solid #111520";

                        return (
                          <td key={p.id} style={{
                            width:CELL_W, minWidth:CELL_W,
                            height:"auto", minHeight:36,
                            borderTop: bandTop,
                            borderBottom: bandBottom,
                            borderLeft: bandLeft,
                            borderRight: bandRight,
                            background: showColor
                              ? cellBgColor
                              : (affected ? (isDecidingCell ? "rgba(250,204,21,0.08)" : (isHovRow ? "#111825" : "#0D0F14")) : (isHovRow ? "#111520" : "#0D0F14")),
                            boxShadow: !showColor && isDecidingCell ? decidingShadow : "none",
                            verticalAlign:"top",
                            padding: affected ? "8px 12px" : "8px 6px",
                            textAlign: affected ? "left" : "center",
                            transition:"background 0.15s, border-color 0.15s",
                          }}>
                            {affected ? (
                              <div style={{display:"flex", flexDirection:"column", gap:5}}>
                                {cellDesc && (
                                  <div style={{
                                    fontSize:10.5, lineHeight:1.55,
                                    color: isHovRow ? "#94A3B8" : "#6B7A90",
                                    fontFamily:"system-ui,sans-serif",
                                    transition:"color 0.1s",
                                  }}>{cellDesc}</div>
                                )}
                                <span style={{
                                  fontSize:9.5, color:cellDc,
                                  opacity: isHovRow ? 0.8 : 0.5,
                                  fontFamily:"system-ui,sans-serif",
                                  transition:"opacity 0.1s",
                                }}>{DIFFICULTY_LABEL[cellDiff]}</span>
                              </div>
                            ) : (
                              <span style={{fontSize:10, color:"#2D3748"}}>—</span>
                            )}
                          </td>
                        );
                      }

                      // ── Numeric cell ─────────────────────────────────────
                      if(kind==="numeric"){
                        const hasVal=typeof val==="number";
                        const {cellBg:nBg,bTop:nBT,bBot:nBB,bLeft:nBL,bRight:nBR} = getPropCellStyle(p.id,String(val),hasVal,rowIdx,valueGroups,protocolValueGroup,sortedProtocols,colorCells,isHovRow);
                        return (
                          <td key={p.id} style={{width:CELL_W,minWidth:CELL_W,height:"auto",minHeight:36,borderTop:nBT,borderBottom:nBB,borderLeft:nBL,borderRight:nBR,background:isBest?bestBg:nBg,boxShadow:!isBest&&isDecidingCell?decidingShadow:"none",textAlign:"center",verticalAlign:"top",paddingTop:9,transition:"background 0.15s"}}>
                            {hasVal?<span style={{fontSize:13,fontWeight:500,color:isBest?"#FDE68A":(lit?"#BAE6FD":"#7DD3FC"),fontVariantNumeric:"tabular-nums",letterSpacing:"-0.02em"}}>{val}</span>:<span style={{fontSize:10,color:"#2D3748"}}>{val===null?"N/A":"—"}</span>}
                          </td>
                        );
                      }

                      // ── String cell ──────────────────────────────────────
                      if(kind==="string"){
                        const hasVal=val!==undefined&&val!==null;
                        const {cellBg:sBg,bTop:sBT,bBot:sBB,bLeft:sBL,bRight:sBR} = getPropCellStyle(p.id,String(val),hasVal,rowIdx,valueGroups,protocolValueGroup,sortedProtocols,colorCells,isHovRow);
                        return (
                          <td key={p.id} style={{width:CELL_W,minWidth:CELL_W,height:"auto",minHeight:36,borderTop:sBT,borderBottom:sBB,borderLeft:sBL,borderRight:sBR,background:isBest?bestBg:sBg,boxShadow:!isBest&&isDecidingCell?decidingShadow:"none",textAlign:"center",verticalAlign:"top",paddingTop:9,transition:"background 0.15s"}}>
                            {hasVal?<span style={{fontSize:11,fontWeight:500,color:isBest?"#FDE68A":(lit?"#DDD6FE":"#C4B5FD"),whiteSpace:"nowrap"}}>{val}</span>:<span style={{fontSize:10,color:"#2D3748"}}>—</span>}
                          </td>
                        );
                      }

                      // ── Bool cell ────────────────────────────────────────
                      const has=val===true,notHas=val===false;
                      return (
                        <td key={p.id} style={{width:CELL_W,minWidth:CELL_W,height:"auto",minHeight:36,borderRight:"1px solid #111520",borderBottom:"1px solid #111520",background:isBest?bestBg:(lit?"#111825":"#0D0F14"),boxShadow:!isBest&&isDecidingCell?decidingShadow:"none",textAlign:"center",verticalAlign:"top",paddingTop:9}}>
                          {has?(
                            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:5,background:isBest?"rgba(250,204,21,0.2)":"rgba(52,211,153,0.12)",border:`1px solid ${isBest?"rgba(250,204,21,0.6)":"rgba(52,211,153,0.4)"}`}}>
                              <svg width="11" height="8" viewBox="0 0 11 8"><path d="M1 4L3.8 7L10 1" stroke={isBest?"#FDE68A":"#34D399"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                          ):notHas?(
                            <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,borderRadius:5,background:"transparent",border:`1px solid ${lit?"#2D3748":"#1A1F2E"}`}}>
                              <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 1.5L7.5 7.5M7.5 1.5L1.5 7.5" stroke={lit?"#4A5568":"#2D3748"} strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </div>
                          ):(
                            <div style={{width:5,height:5,borderRadius:"50%",background:lit?"#2D3748":"#161B27",margin:"auto"}}/>
                          )}
                        </td>
                      );
                    })}

                    {/* Coverage / worst-difficulty column */}
                    <td style={{width:COV_W,minWidth:COV_W,height:"auto",minHeight:36,borderBottom:"1px solid #111520",background:isHovRow?"#111520":"#0D0F14",textAlign:"center",verticalAlign:"top",paddingTop:9}}>
                      {kind==="problem"?(()=>{
                        const dc = DIFFICULTY_COLOR[item.groupKey==="all"?1:item.groupKey==="partial"?2:3] ?? "#4A5568";
                        return count > 0
                          ? <span style={{fontSize:9,fontWeight:500,color:dc,letterSpacing:"0.04em"}}>{count}/{total}</span>
                          : <span style={{fontSize:10,color:"#2D3748"}}>—</span>;
                      })():kind==="numeric"||kind==="string"?(
                        <span style={{fontSize:9,color:"#4A5568",fontStyle:"italic"}}>{kind==="string"&&allSame?"≡":"~"}</span>
                      ):(
                        <span style={{fontSize:11,fontWeight:500,color:"#64748B",fontVariantNumeric:"tabular-nums"}}>{total<=1?"✓":`${count}/${total}`}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer ── */}
      {total>0&&(
        <div style={{padding:"7px 24px",borderTop:"1px solid #161B27",display:"flex",gap:20,alignItems:"center",flexShrink:0,background:"#0A0C11"}}>
          <span style={{fontSize:10,color:"#2D3748"}}>
            {total} protocol{total!==1?"s":""} · {propItems.length} properties · {probItems.length} problems
            {hiddenProps.size>0&&<span style={{color:"#2D3748",marginLeft:6}}> · {hiddenProps.size} hidden</span>}
          </span>

        </div>
      )}
      {/* ── Tooltip panel ── */}
      {tooltip && (
        <div
          onMouseEnter={onTooltipEnter}
          onMouseLeave={onTooltipLeave}
          style={{
            position:"fixed", left:tooltip.x, top:tooltip.y,
            width:380, maxHeight:320, zIndex:9999,
            display:"flex", flexDirection:"column",
            background:"#13171F", border:"1px solid #2A3347", borderRadius:8,
            boxShadow:"0 12px 40px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05)",
          }}>
          {/* Fixed header */}
          <div style={{
            padding:"13px 16px 11px",
            borderBottom:"1px solid #1E2D40",
            flexShrink:0,
          }}>
            <div style={{
              fontSize:11.5, fontWeight:600, color:"#E2E8F0",
              fontFamily:"'Syne',sans-serif", letterSpacing:"-0.01em",
            }}>{tooltip.label}</div>
          </div>
          {/* Scrollable body */}
          <div style={{
            overflowY:"auto", padding:"12px 16px 14px", flex:1,
          }}>
            <div style={{
              fontSize:11.5, color:"#8899AA", lineHeight:1.75,
              fontFamily:"system-ui,sans-serif",
            }}>
              {parseDesc(tooltip.desc)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}