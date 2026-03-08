export const PROPERTY_META = {
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
export const DIFFICULTY_LABEL = { 1:"minor", 2:"moderate", 3:"severe" };
export const DIFFICULTY_COLOR = { 1:"#FBBF24", 2:"#F97316", 3:"#F87171" };

// Global problem descriptions: explains *what* the problem is in protocol-agnostic terms.
// No protocol names or protocol-specific detail should appear here.
export const OPEN_PROBLEM_META = {
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


export const PROTOCOLS = [
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

export const GROUP_META = {
  all:    { color:"#64748B", bg:"rgba(100,116,139,0.08)" },
  partial:{ color:"#64748B", bg:"rgba(100,116,139,0.08)" },
  unique: { color:"#64748B", bg:"rgba(100,116,139,0.08)" },
  numeric:{ color:"#7DD3FC", bg:"rgba(125,211,252,0.08)" },
  string: { color:"#C4B5FD", bg:"rgba(196,181,253,0.08)" },
};
